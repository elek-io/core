import type { ChildProcess } from 'node:child_process';
import Fs from 'fs-extra';
import type {
  IGitExecutionOptions,
  IGitResult,
  IGitStringResult,
} from 'dugite';
import { exec as gitExec, GitError, parseError } from 'dugite';
import PQueue from 'p-queue';
import Path from 'node:path';
import { CoreError } from '../util/shared.js';
import type {
  GitMergeOptions,
  GitMessage,
  LogAttributes,
  LogProps,
} from '../schema/index.js';
import {
  gitCommitSchema,
  gitMessageSchema,
  uuidSchema,
  type ElekIoCoreOptions,
  type GitCloneOptions,
  type GitCommit,
  type GitInitOptions,
  type GitLogOptions,
  type GitStatus,
  type GitSwitchOptions,
  type User,
} from '../schema/index.js';
import { datetime } from '../util/shared.js';
import { GitTagService } from './GitTagService.js';
import type { CacheService } from './CacheService.js';
import type { LogService } from './LogService.js';
import type { UserService } from './UserService.js';
import { PROVISIONED_MARKER, type PathTo } from '../util/node.js';
import type {
  GitCredentialOutcome,
  GitCredentialRelay,
} from '../util/gitCredentialRelay.js';
import {
  ATOMIC_NOT_FAST_FORWARD,
  classifyAuthError,
  classifyLoadError,
  gitOutputCause,
  isMutatingGitCommand,
  parsePorcelainStatusLine,
  recordsGitIdentity,
  redactedCommand,
} from '../util/git.js';

/**
 * Runs real git through the dugite bindings, so Git LFS works. Every command
 * goes through a FIFO queue of concurrency 1, so calls against one Core are
 * serialized rather than racing, and every command line is logged, a mutation
 * at `info` and a read at `debug`, with the User's identity redacted out of
 * it. Credentials reach git through Core's own helper, for elek.io Cloud's
 * git hosts and for `ELEK_IO_REMOTE_ACCESS_TOKEN`, and never through a prompt.
 *
 * @see https://github.com/desktop/dugite
 * @see ../../contributing/git-credentials.md
 * @see ../../contributing/git-identity.md
 */
export class GitService {
  private version: string | null;
  private gitPath: string | null;
  private queue: PQueue;
  private options: ElekIoCoreOptions;
  private credentialRelay: GitCredentialRelay;
  private logService: LogService;
  private gitTagService: GitTagService;
  private userService: UserService;
  private cacheService: CacheService;

  public constructor(
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    userService: UserService,
    cacheService: CacheService,
    credentialRelay: GitCredentialRelay
  ) {
    this.version = null;
    this.gitPath = null;
    this.queue = new PQueue({
      concurrency: 1, // No concurrency because git operations are sequencial
    });
    this.gitTagService = new GitTagService(
      options,
      pathTo,
      this.git.bind(this),
      logService
    );
    this.options = options;
    this.credentialRelay = credentialRelay;
    this.logService = logService;
    this.userService = userService;
    this.cacheService = cacheService;

    void this.updateVersion();
    void this.updateGitPath();
  }

  /**
   * CRUD methods to work with git tags
   */
  public get tags(): GitTagService {
    return this.gitTagService;
  }

  /**
   * Create an empty Git repository or reinitialize an existing one. Fails
   * when the path does not exist, it initializes into a directory rather than
   * creating one. It also writes the local git config and installs the Git
   * LFS filters, so it has to run before any file below `lfs/` is added.
   *
   * Throws `PreconditionFailed` in read-only mode. It needs no User, the
   * config holds no identity.
   *
   * @see https://git-scm.com/docs/git-init
   */
  public async init(
    path: string,
    options?: Partial<GitInitOptions>
  ): Promise<void> {
    if (this.options.isReadOnly) {
      throw CoreError.preconditionFailed(
        'Cannot init a repository because Core is in read-only mode'
      );
    }

    let args = ['init'];

    if (options?.initialBranch) {
      args = [...args, `--initial-branch=${options.initialBranch}`];
    }

    await this.git(path, args);
    await this.setLocalConfig(path);
    await this.lfs.install(path);
  }

  /**
   * Clone a repository into a directory, which has to exist and be empty.
   *
   * The `lfs` option decides how much is downloaded: the default fetches
   * every LFS object of the whole history so Assets work offline, `current`
   * only the checked-out ref, which is what a build clone wants. A bare clone
   * skips both LFS and the local config, and so does a read-only Core, which
   * never commits. It needs no User, the config holds no identity.
   *
   * @see https://git-scm.com/docs/git-clone
   */
  public async clone(
    url: string,
    path: string,
    options?: Partial<GitCloneOptions>
  ): Promise<void> {
    let args = ['clone', '--progress'];

    if (options?.bare) {
      args = [...args, '--bare'];
    }

    if (options?.branch) {
      args = [...args, '--branch', options.branch];
    }

    if (options?.depth) {
      args = [...args, '--depth', options.depth.toString()];
    }

    if (options?.singleBranch === true) {
      args = [...args, '--single-branch'];
    }

    await this.git('', [...args, url, path]);
    // A read-only Core never commits, so it needs no behavior config
    if (!this.options.isReadOnly) {
      await this.setLocalConfig(path);
    }

    // A bare clone has no working tree, so LFS materialization does not apply
    // (and would error). A bare repository is a remote, not a working Project.
    if (options?.bare !== true) {
      // `git clone` only fetches LFS objects for the checked-out ref (if any).
      // Install LFS, then fetch into the local store and materialize the
      // working tree. The default fetches the whole history, so all Assets
      // are available offline. The `current` scope only fetches the
      // checked-out ref, meant for build-mode clones.
      await this.lfs.install(path);
      if (options?.lfs === 'current') {
        await this.lfs.fetch(path);
      } else {
        await this.lfs.fetchAll(path);
      }
      await this.lfs.checkout(path);
    }

    // A clone materializes a fresh working tree, so drop any cache for paths a
    // previous repository at this location may have populated
    this.cacheService.clear();
  }

  /**
   * Add file contents to the index
   *
   * @see https://git-scm.com/docs/git-add
   */
  public async add(path: string, files: string[]): Promise<void> {
    const relativePathsFromRepositoryRoot = files.map((filePath) => {
      return filePath.replace(`${path}${Path.sep}`, '');
    });

    const args = ['add', '--', ...relativePathsFromRepositoryRoot];

    await this.git(path, args);
  }

  /**
   * The working tree's state. `files` names every entry git reported, each
   * path relative to the repository root, and a renamed one carries its new
   * path rather than the pair.
   *
   * Ignored files never appear, because `git status` does not report them
   * without `--ignored`.
   *
   * @see https://git-scm.com/docs/git-status#_porcelain_format_version_2
   */
  public async status(path: string): Promise<GitStatus> {
    const args = ['status', '--porcelain=2'];
    const result = await this.git(path, args);

    const files = result.stdout
      .split('\n')
      .filter((line) => line.trim() !== '')
      .flatMap((line) => {
        const parsed = parsePorcelainStatusLine(line);
        return parsed ? [parsed] : [];
      });

    return { isClean: files.length === 0, files };
  }

  public branches = {
    /**
     * List branches, split by the `remotes/` prefix git prints.
     *
     * The `*` marker is stripped, so `branches.current` is what identifies
     * the checked-out branch. Git's `origin/HEAD -> origin/main` symref line
     * comes back verbatim in `remote` and is not a branch name.
     *
     * @see https://www.git-scm.com/docs/git-branch
     */
    list: async (
      path: string
    ): Promise<{ local: string[]; remote: string[] }> => {
      const args = ['branch', '--list', '--all'];
      const result = await this.git(path, args);
      const normalizedLinesArr = result.stdout
        .split('\n')
        .filter((line) => {
          return line.trim() !== '';
        })
        .map((line) => {
          return line.trim().replace('* ', '');
        });

      const local: string[] = [];
      const remote: string[] = [];
      normalizedLinesArr.forEach((line) => {
        if (line.startsWith('remotes/')) {
          remote.push(line.replace('remotes/', ''));
        } else {
          local.push(line);
        }
      });
      return { local, remote };
    },
    /**
     * Returns the name of the current branch. In detached HEAD state, an empty string is returned.
     *
     * @see https://www.git-scm.com/docs/git-branch#Documentation/git-branch.txt---show-current
     */
    current: async (path: string): Promise<string> => {
      const args = ['branch', '--show-current'];
      const result = await this.git(path, args);
      return result.stdout.trim();
    },
    /**
     * Switch branches
     *
     * @see https://git-scm.com/docs/git-switch/
     */
    switch: async (
      path: string,
      branch: string,
      options?: GitSwitchOptions
    ): Promise<void> => {
      await this.checkBranchOrTagName(path, branch);

      let args = ['switch'];

      if (options?.discardChanges === true) {
        args = [...args, '--discard-changes'];
      }

      if (options?.create === true) {
        args = [...args, '--create', branch];
      } else if (options?.forceCreate === true) {
        args = [...args, '--force-create', branch];
        if (options.startPoint) {
          args = [...args, options.startPoint];
        }
      } else if (options?.detach === true) {
        args = [...args, '--detach', branch];
      } else {
        args = [...args, branch];
      }

      await this.git(path, args);
      // Switching branches rewrites the working tree, so cached file contents
      // may no longer match disk
      this.cacheService.clear();
    },
    /**
     * Delete a branch
     *
     * @see https://git-scm.com/docs/git-branch#Documentation/git-branch.txt---delete
     */
    delete: async (
      path: string,
      branch: string,
      force?: boolean
    ): Promise<void> => {
      let args = ['branch', '--delete'];

      if (force === true) {
        args = [...args, '--force'];
      }

      await this.git(path, [...args, branch]);
    },
  };

  public remotes = {
    /**
     * Returns a list of currently tracked remotes
     *
     * @see https://git-scm.com/docs/git-remote
     */
    list: async (path: string): Promise<string[]> => {
      const args = ['remote'];
      const result = await this.git(path, args);
      return result.stdout.split('\n').filter((line) => {
        return line.trim() !== '';
      });
    },
    /**
     * Returns true if the `origin` remote exists, otherwise false
     */
    hasOrigin: async (path: string): Promise<boolean> => {
      const remotes = await this.remotes.list(path);
      return remotes.includes('origin');
    },
    /**
     * Returns true if the `origin` remote is reachable, otherwise false
     *
     * Uses plain `git ls-remote` (git ref advertisement, no Git LFS involved),
     * so it succeeds against any reachable repository, even an empty one. Used
     * to tell a down or unauthorized host apart from a reachable host whose
     * Git LFS endpoint is broken or absent.
     *
     * @see https://git-scm.com/docs/git-ls-remote
     */
    isOriginReachable: async (path: string): Promise<boolean> => {
      try {
        await this.git(path, ['ls-remote', '--quiet', 'origin']);
        return true;
      } catch {
        return false;
      }
    },
    /**
     * Lists the ref names the `origin` remote advertises, branches and tags
     * alike, so an empty result means an empty remote. Asks the remote
     * rather than the remote-tracking refs, which a fetch never prunes.
     *
     * @see https://git-scm.com/docs/git-ls-remote
     */
    listOriginRefs: async (path: string): Promise<string[]> => {
      const result = await this.git(path, ['ls-remote', '--quiet', 'origin']);
      return this.advertisedRefNames(result.stdout);
    },
    /**
     * Adds the `origin` remote with given URL
     *
     * Throws if `origin` remote is added already.
     *
     * @see https://git-scm.com/docs/git-remote#Documentation/git-remote.txt-emaddem
     */
    addOrigin: async (path: string, url: string): Promise<void> => {
      const args = ['remote', 'add', 'origin', url.trim()];
      await this.git(path, args);
    },
    /**
     * Returns the current `origin` remote URL
     *
     * Throws if no `origin` remote is added yet.
     *
     * @see https://git-scm.com/docs/git-remote#Documentation/git-remote.txt-emget-urlem
     */
    getOriginUrl: async (path: string): Promise<string | null> => {
      const args = ['remote', 'get-url', 'origin'];
      const result = await this.git(path, args);
      const url = result.stdout.trim();
      return url.length === 0 ? null : url;
    },
    /**
     * Sets the current `origin` remote URL
     *
     * Throws if no `origin` remote is added yet.
     *
     * @see https://git-scm.com/docs/git-remote#Documentation/git-remote.txt-emset-urlem
     */
    setOriginUrl: async (path: string, url: string): Promise<void> => {
      const args = ['remote', 'set-url', 'origin', url.trim()];
      await this.git(path, args);
    },
  };

  /**
   * Git LFS (Large File Storage) functionality
   *
   * Asset binaries live in the `lfs/` folder and are tracked with Git LFS so
   * they are stored as pointers in history while the bytes are offloaded.
   * git-lfs ships with dugite, so no external binary is required.
   *
   * @see https://git-lfs.com
   */
  public lfs = {
    /**
     * Installs Git LFS for the given repository
     *
     * Configures the clean/smudge filter in the local git config and installs
     * the pre-push hook. Must run before any `lfs/` file is added so it gets
     * cleaned to a pointer automatically.
     *
     * @see https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-install.adoc
     */
    install: async (path: string): Promise<void> => {
      await this.git(path, ['lfs', 'install', '--local']);
    },
    /**
     * Downloads every LFS object across all refs into the local store
     *
     * This keeps the whole history available offline. No-op for repositories
     * without LFS objects, so it is safe to call unconditionally.
     *
     * @see https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-fetch.adoc
     */
    fetchAll: async (path: string): Promise<void> => {
      await this.git(path, ['lfs', 'fetch', '--all']);
    },
    /**
     * Downloads the LFS objects of the currently checked-out ref from
     * the `origin` remote into the local LFS store
     *
     * @see https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-fetch.adoc
     */
    fetch: async (path: string): Promise<void> => {
      await this.git(path, ['lfs', 'fetch', 'origin']);
    },
    /**
     * Materializes (smudges) working-tree files from the local LFS store
     *
     * @see https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-checkout.adoc
     */
    checkout: async (path: string): Promise<void> => {
      await this.git(path, ['lfs', 'checkout']);
    },
    /**
     * Returns true if given content is a Git LFS pointer
     *
     * LFS pointers always start with this version line. Used to decide whether
     * a blob read from history needs to be resolved to its real bytes via
     * `smudge`.
     *
     * @see https://github.com/git-lfs/git-lfs/blob/main/docs/spec.md
     */
    isPointer: (content: string): boolean => {
      return content.startsWith('version https://git-lfs.github.com/spec/v1');
    },
    /**
     * Reads a pointer on stdin and writes the bytes to stdout, which resolves
     * a binary Asset read from history. `filePath` is only for the progress
     * bar.
     *
     * After a default clone every object of the history is local, so this
     * stays offline. A clone made with `lfs: 'current'`, which a provisioned
     * copy gets, holds only the checked-out ref, so smudging a blob from
     * another ref does reach the remote.
     *
     * @see https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-smudge.adoc
     */
    smudge: async (
      path: string,
      pointer: string,
      filePath: string
    ): Promise<string> => {
      const relativePathFromRepositoryRoot = filePath.replace(
        `${path}${Path.sep}`,
        ''
      );
      const normalizedPath = relativePathFromRepositoryRoot
        .split('\\')
        .join('/');
      const setEncoding: (process: ChildProcess) => void = (cb) => {
        if (cb.stdout) {
          cb.stdout.setEncoding('binary');
        }
      };

      const result = await this.git(
        path,
        ['lfs', 'smudge', '--', normalizedPath],
        {
          stdin: pointer,
          processCallback: setEncoding,
        }
      );
      return result.stdout;
    },
    /**
     * Uploads the LFS objects to the `origin` remote
     *
     * Run before the ref push so an upload failure is attributable. If the
     * remote does not support Git LFS, has it disabled, or its LFS endpoint is
     * unreachable, throws a descriptive `PreconditionFailed`. A genuine host or
     * auth outage, where plain git transport also fails, is surfaced unchanged.
     *
     * @see https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-push.adoc
     */
    push: async (
      path: string,
      options?: Partial<{ all: boolean; refs: string[] }>
    ): Promise<void> => {
      const branch = await this.branches.current(path); // '' in detached HEAD
      const refs = options?.refs ?? (branch === '' ? null : [branch]);

      // Synopsis: `git lfs push [options] <remote> [<ref>...]` - so `--all` is
      // an option and must precede the remote; the ref form is positional.
      const args =
        options?.all === true || refs === null
          ? ['lfs', 'push', '--all', 'origin']
          : ['lfs', 'push', 'origin', ...refs];

      try {
        await this.git(path, args);
      } catch (error) {
        // A typed failure already says what went wrong, and probing would
        // run git again, which for a refused Cloud token mints another
        if (error instanceof CoreError && error.type !== 'Internal') {
          throw error;
        }
        // git-lfs emits Go HTTP errors that git's own error parsing does not
        // recognize. Tell a down or unauthorized host apart from a reachable
        // host with a broken LFS endpoint with a plain git reachability probe.
        if ((await this.remotes.isOriginReachable(path)) === false) {
          throw error; // host, repository or auth problem for git itself
        }
        const url = await this.remotes.getOriginUrl(path).catch(() => null);
        throw CoreError.preconditionFailed(
          `Git LFS upload to the remote${url ? ` "${url}"` : ''} failed. The remote does not support Git LFS, has it disabled, or its LFS endpoint is unreachable. elek.io stores Asset binaries with Git LFS, please use a Git provider with LFS enabled.`,
          error
        );
      }
    },
  };

  /**
   * Join two development histories together.
   *
   * `squash` stages the merged result without creating a commit, so the
   * caller has to commit afterwards, as the Project upgrade flow does. A
   * merge commit is signed as the current User.
   *
   * A conflict throws `Internal` and leaves the tree mid-merge, rather than
   * aborting it the way `rebase` does.
   *
   * @see https://git-scm.com/docs/git-merge
   */
  public async merge(
    path: string,
    branch: string,
    options?: Partial<GitMergeOptions>
  ): Promise<void> {
    let args = ['merge'];

    if (options?.squash === true) {
      args = [...args, '--squash'];
    }

    args = [...args, branch];

    await this.git(path, args);
    // Merging rewrites the working tree, so cached file contents may no longer
    // match disk
    this.cacheService.clear();
  }

  /**
   * Rebase the current branch onto `onto` (for example `origin/draft`).
   *
   * A clean success leaves the working tree holding the integrated state,
   * each replayed commit keeping its author with the current User as its
   * committer. A textual conflict, classified with dugite's own `parseError`,
   * aborts the rebase and throws `PreconditionFailed`. Any other failure
   * throws `Internal`.
   *
   * @see https://git-scm.com/docs/git-rebase
   */
  public async rebase(path: string, onto: string): Promise<void> {
    const result = await this.git(path, ['rebase', onto], {
      tolerateNonZero: true,
    });

    if (result.exitCode === 0) {
      // Rebasing rewrites the working tree, so cached file contents may no
      // longer match disk
      this.cacheService.clear();
      return;
    }

    const gitError = parseError(result.stderr);
    if (
      gitError === GitError.RebaseConflicts ||
      gitError === GitError.MergeConflicts
    ) {
      // Leave a clean tree instead of a half-applied rebase the caller would
      // otherwise have to unwind by hand.
      await this.rebaseAbort(path);
      throw CoreError.preconditionFailed(
        'Rebase stopped on a textual conflict. Your local changes conflict with the remote and were not integrated. Resolve them and synchronize again.',
        `${result.stdout}\n${result.stderr}`.trim()
      );
    }

    throw CoreError.internal(
      `Git rebase onto "${onto}" failed with exit code "${result.exitCode}"`,
      gitOutputCause(result.stderr, result.stdout)
    );
  }

  /**
   * Abort an in-progress rebase, restoring the pre-rebase HEAD and a clean
   * working tree.
   *
   * @see https://git-scm.com/docs/git-rebase#Documentation/git-rebase.txt---abort
   */
  public async rebaseAbort(path: string): Promise<void> {
    await this.git(path, ['rebase', '--abort']);
    // Aborting restores files on disk, so cached file contents may no longer
    // match disk
    this.cacheService.clear();
  }

  /**
   * Reset current HEAD to the specified state
   *
   * @see https://git-scm.com/docs/git-reset
   */
  public async reset(
    path: string,
    mode: 'soft' | 'hard',
    commit: string
  ): Promise<void> {
    const args = ['reset', `--${mode}`, commit];
    await this.git(path, args);
    // A hard reset restores files on disk, so cached file contents may no longer
    // match disk. A soft reset only moves HEAD and leaves the working tree alone
    if (mode === 'hard') {
      this.cacheService.clear();
    }
  }

  /**
   * Download objects and refs from remote `origin`
   *
   * The `ref` option restricts the fetch to a single ref and can be a
   * branch name or a full refspec. The `depth` option limits the
   * fetched history.
   *
   * @see https://www.git-scm.com/docs/git-fetch
   */
  public async fetch(
    path: string,
    options?: Partial<{ ref: string; depth: number }>
  ): Promise<void> {
    let args = ['fetch'];

    if (options?.depth) {
      args = [...args, '--depth', options.depth.toString()];
    }

    if (options?.ref) {
      args = [...args, 'origin', options.ref];
    }

    await this.git(path, args);
  }

  /**
   * Resolves a revision to the commit hash it points to
   *
   * @see https://git-scm.com/docs/git-rev-parse
   */
  public async revParse(path: string, rev: string): Promise<string> {
    const result = await this.git(path, ['rev-parse', rev]);
    return result.stdout.trim();
  }

  /**
   * True when `ancestor` is reachable from `descendant`, which includes the
   * two being the same commit. Reads local history only. Throws `Internal`
   * when either revision does not resolve.
   *
   * @see https://git-scm.com/docs/git-merge-base#Documentation/git-merge-base.txt---is-ancestor
   */
  public async isAncestor(
    path: string,
    ancestor: string,
    descendant: string
  ): Promise<boolean> {
    const result = await this.git(
      path,
      ['merge-base', '--is-ancestor', ancestor, descendant],
      { tolerateNonZero: true }
    );
    switch (result.exitCode) {
      case 0:
        return true;
      case 1:
        return false;
      default:
        throw CoreError.internal(
          `Git merge-base of "${ancestor}" and "${descendant}" failed with exit code "${result.exitCode}"`,
          gitOutputCause(result.stderr, result.stdout)
        );
    }
  }

  /**
   * Lists the ref names a remote repository advertises, without cloning
   *
   * @see https://git-scm.com/docs/git-ls-remote
   */
  public async lsRemote(url: string): Promise<string[]> {
    const result = await this.git('', ['ls-remote', '--quiet', url]);
    return this.advertisedRefNames(result.stdout);
  }

  /**
   * The best common ancestor of two commits, or null when their histories
   * share none, as with a repository created elsewhere. Reads local history
   * only. Throws `Internal` when either revision does not resolve.
   *
   * @see https://git-scm.com/docs/git-merge-base
   */
  public async mergeBase(
    path: string,
    a: string,
    b: string
  ): Promise<string | null> {
    const result = await this.git(path, ['merge-base', a, b], {
      tolerateNonZero: true,
    });
    switch (result.exitCode) {
      case 0:
        return result.stdout.trim();
      case 1:
        return null;
      default:
        throw CoreError.internal(
          `Git merge-base of "${a}" and "${b}" failed with exit code "${result.exitCode}"`,
          gitOutputCause(result.stderr, result.stdout)
        );
    }
  }

  /**
   * Fetch from `origin` and rebase the local branch onto it. Always a rebase:
   * `setLocalConfig` sets `pull.rebase` in every repository `init` or `clone`
   * touches.
   *
   * A conflict is not aborted here, so the working tree is left mid-rebase
   * and `Internal` is thrown.
   *
   * @see https://git-scm.com/docs/git-pull
   */
  public async pull(path: string): Promise<void> {
    const args = ['pull'];
    await this.git(path, args);
    // Pulling integrates remote changes into the working tree, so cached file
    // contents may no longer match disk
    this.cacheService.clear();
  }

  /**
   * Updates `origin` with the current branch, `refs` or `all` branches, LFS
   * objects first so an upload failure is attributable. `atomic` lands every
   * ref or none, and `setUpstream` makes each pushed branch track the remote's.
   *
   * Throws `PreconditionFailed` in read-only mode, on a provisioned copy, on
   * a non-fast-forward rejection, on an unusable LFS endpoint and on an
   * `atomic` push the remote does not support, `BadRequest` when `all` and
   * `refs` are combined, `Unauthorized` when the remote rejects credentials.
   *
   * @see ../../docs/git-and-sync.md
   */
  public async push(
    path: string,
    options?: Partial<{
      all: boolean;
      atomic: boolean;
      force: boolean;
      refs: string[];
      setUpstream: boolean;
    }>
  ): Promise<void> {
    if (this.options.isReadOnly) {
      throw CoreError.preconditionFailed(
        'Cannot push because Core is in read-only mode'
      );
    }

    // Backstop for callers that bypass the service layer. The services
    // guard earlier through assertNotProvisioned.
    if (await Fs.pathExists(Path.join(path, PROVISIONED_MARKER))) {
      throw CoreError.preconditionFailed(
        `Cannot push because "${path}" is a provisioned copy. The next provision run overwrites it. Delete it and clone the Project to work on it.`
      );
    }

    if (options?.all === true && options?.refs) {
      throw CoreError.badRequest(
        'The "all" and "refs" push options are mutually exclusive'
      );
    }

    // 1. Upload the LFS objects first so an upload failure is attributable.
    await this.lfs.push(
      path,
      options?.refs
        ? { all: false, refs: options.refs }
        : { all: options?.all === true }
    );

    // 2. Push the refs. The objects are already uploaded, so skip the pre-push
    // hook with `--no-verify` to avoid a redundant LFS verification round-trip.
    let args = ['push', 'origin', '--no-verify'];

    if (options?.all === true) {
      args = [...args, '--all'];
    }

    if (options?.atomic === true) {
      args = [...args, '--atomic'];
    }

    if (options?.setUpstream === true) {
      args = [...args, '--set-upstream'];
    }

    if (options?.refs) {
      args = [...args, ...options.refs];
    }

    if (options?.force === true) {
      args = [...args, '--force'];
    }

    const result = await this.git(path, args, {
      tolerateNonZero: true,
    });
    if (result.exitCode !== 0) {
      const authError = classifyAuthError(
        result.stderr,
        this.credentialRelay.hasRemoteToken
      );
      if (authError) {
        throw authError;
      }
      const message = `${result.stderr}\n${result.stdout}`.trim();
      // git refuses before sending anything, so no ref landed
      if (result.stderr.includes('does not support --atomic push')) {
        throw CoreError.preconditionFailed(
          'Push refused because the remote does not support atomic pushes. Nothing was pushed.',
          message
        );
      }
      // A non-fast-forward rejection is recoverable by re-integrating the
      // remote and pushing again, so it is surfaced distinctly from a genuine
      // push failure (which stays `Internal`).
      if (
        parseError(result.stderr) === GitError.PushNotFastForward ||
        ATOMIC_NOT_FAST_FORWARD.test(result.stderr)
      ) {
        throw CoreError.preconditionFailed(
          'Push rejected because the remote advanced. Re-integrate the remote changes and try again.',
          message
        );
      }
      throw CoreError.internal(
        `Git push to origin failed with exit code "${result.exitCode}"`,
        gitOutputCause(result.stderr, result.stdout)
      );
    }
  }

  /**
   * Records what is already staged, so `add` has to run first. `message` is a
   * structured reference rather than free text: the commit message is
   * generated from it, a capitalized `<method> <objectType> <id>` subject
   * plus `Method:`, `Object-Type:`, `Object-Id:` and `Collection-Id:`
   * trailers, which `log()` parses back out.
   *
   * The current User is its author and committer. Throws `BadRequest` when
   * `message` fails its schema, and `Unauthorized` when no User is set.
   *
   * @see https://git-scm.com/docs/git-commit
   */
  public async commit(path: string, message: GitMessage): Promise<void> {
    if (this.options.isReadOnly) {
      throw CoreError.preconditionFailed(
        'Cannot commit because Core is in read-only mode'
      );
    }

    // Backstop for callers that bypass the service layer. The services
    // guard earlier through assertNotProvisioned, before writing files.
    if (await Fs.pathExists(Path.join(path, PROVISIONED_MARKER))) {
      throw CoreError.preconditionFailed(
        `Cannot commit because "${path}" is a provisioned copy. The next provision run overwrites it. Delete it and clone the Project to work on it.`
      );
    }

    const parsed = gitMessageSchema.safeParse(message);
    if (!parsed.success) {
      throw CoreError.badRequest(parsed.error.message, parsed.error);
    }

    const user = await this.userService.get();

    if (!user) {
      throw CoreError.unauthorized(
        'No user is set in Core. Please set a User before doing any git operations.'
      );
    }

    const subject = `${message.method.charAt(0).toUpperCase() + message.method.slice(1)} ${message.reference.objectType} ${message.reference.id}`;
    const trailers = [
      `Method: ${message.method}`,
      `Object-Type: ${message.reference.objectType}`,
      `Object-Id: ${message.reference.id}`,
    ];
    if (message.reference.collectionId) {
      trailers.push(`Collection-Id: ${message.reference.collectionId}`);
    }
    const fullMessage = `${subject}\n\n${trailers.join('\n')}`;

    const args = ['commit', `--message=${fullMessage}`];
    // The same ids the commit carries as trailers, so a log line and the
    // commit it produced join without parsing either. The User checked above
    // is the one it is signed as, rather than one read a second time
    await this.git(path, args, {
      user,
      attributes: {
        'elek.method': message.method,
        'elek.object.type': message.reference.objectType,
        'elek.object.id': message.reference.id,
        ...(message.reference.collectionId
          ? { 'elek.collection.id': message.reference.collectionId }
          : {}),
      },
    });
  }

  /**
   * Local commit history, filtered through `isGitCommit`, so any commit not
   * carrying Core's own trailers is silently dropped. A merge commit or one
   * made outside Core never appears.
   *
   * `tag` is resolved by reading the tag file, and comes back null when the
   * commit carries no tag decoration, the tag is not named with a UUID, or
   * the tag cannot be read.
   *
   * @see https://git-scm.com/docs/git-log
   */
  public async log(
    path: string,
    options?: Partial<GitLogOptions>
  ): Promise<GitCommit[]> {
    let args = ['log'];

    if (options?.between?.from) {
      args = [
        ...args,
        `${options.between.from}..${options.between.to || 'HEAD'}`,
      ];
    }

    if (options?.limit) {
      args = [...args, `--max-count=${options.limit}`];
    }

    const format = [
      '%H',
      '%(trailers:key=Method,valueonly)',
      '%(trailers:key=Object-Type,valueonly)',
      '%(trailers:key=Object-Id,valueonly)',
      '%(trailers:key=Collection-Id,valueonly)',
      '%an',
      '%ae',
      '%aI',
      '%D',
    ].join('|');
    args = [...args, `--format=${format}`];

    if (options?.filePath) {
      args = [...args, '--', options.filePath];
    }

    const result = await this.git(path, args);

    // Trailer values from %(trailers:key=...,valueonly) include trailing newlines.
    // Collapsing "\n|" into "|" rejoins the pipe-delimited fields into single lines.
    const cleaned = result.stdout.replace(/\n\|/g, '|');

    const noEmptyLinesArr = cleaned.split('\n').filter((line) => {
      return line.trim() !== '';
    });

    const lineObjArr = await Promise.all(
      noEmptyLinesArr.map(async (line) => {
        const lineArray = line.split('|');
        const tagId = this.refNameToTagName(lineArray[8]?.trim() || '');
        let tag = null;
        if (tagId) {
          try {
            tag = await this.tags.read({ path, id: tagId });
          } catch {
            tag = null;
          }
        }
        const collectionId = lineArray[4]?.trim();

        return {
          hash: lineArray[0],
          message: {
            method: lineArray[1]?.trim(),
            reference: {
              objectType: lineArray[2]?.trim(),
              id: lineArray[3]?.trim(),
              ...(collectionId ? { collectionId } : {}),
            },
          },
          author: {
            name: lineArray[5],
            email: lineArray[6],
          },
          datetime: datetime(lineArray[7]),
          tag,
        };
      })
    );

    return lineObjArr.filter((obj) => this.isGitCommit(obj));
  }

  /**
   * Retrieves the content of a file at a specific commit
   *
   * Reads the blob through `cat-file` instead of `show`. Revision commands like
   * `show` stat the `<commit>:<path>` argument against the working directory to
   * tell revisions and filenames apart. That stat adds the length of the commit
   * hash on top of an already absolute path, which overflows the 260 char limit
   * on Windows for deep data directories. `cat-file` reads from the object
   * database and never touches the working tree, so any path length works.
   *
   * @see https://git-scm.com/docs/git-cat-file
   */
  public async getFileContentAtCommit(
    path: string,
    filePath: string,
    commitHash: string,
    encoding: 'utf8' | 'binary' = 'utf8'
  ): Promise<string> {
    const relativePathFromRepositoryRoot = filePath.replace(
      `${path}${Path.sep}`,
      ''
    );
    const normalizedPath = relativePathFromRepositoryRoot.split('\\').join('/');
    const args = ['cat-file', 'blob', `${commitHash}:${normalizedPath}`];
    const setEncoding: (process: ChildProcess) => void = (cb) => {
      if (cb.stdout) {
        cb.stdout.setEncoding(encoding);
      }
    };

    const result = await this.git(path, args, {
      processCallback: setEncoding,
    });
    return result.stdout;
  }

  /**
   * Lists directory entries at a specific commit, for example to detect
   * deleted Collections when comparing branches. `treePath` may be absolute
   * or repository relative, the repository prefix is stripped either way.
   *
   * The entries are last path segments rather than repository-relative paths.
   * A missing path or ref yields an empty array rather than throwing, so an
   * empty result does not tell nothing-there from does-not-exist.
   *
   * @see https://git-scm.com/docs/git-ls-tree
   */
  public async listTreeAtCommit(
    path: string,
    treePath: string,
    commitRef: string
  ): Promise<string[]> {
    const relativeTreePath = treePath.replace(`${path}${Path.sep}`, '');
    const normalizedPath = relativeTreePath.split('\\').join('/');
    const args = ['ls-tree', '--name-only', commitRef, `${normalizedPath}/`];

    try {
      const result = await this.git(path, args);
      return result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .map((entry) => {
          // ls-tree returns paths relative to repo root like "collections/uuid"
          // Extract just the last segment (the folder/file name)
          const parts = entry.split('/');
          return parts[parts.length - 1] || entry;
        });
    } catch {
      // If the path or ref doesn't exist (e.g. first release), return empty.
      return [];
    }
  }

  /**
   * Picks the tag out of a `%D` decoration list, or null when there is none.
   *
   * A tagged tip reads `HEAD -> master, tag: <uuid>`, so the tag has to be
   * found among the decorations rather than stripped off the front. Core's
   * own tags are named with a UUID, which is what separates one from a tag
   * somebody else put on the same commit, and anything else answers null.
   */
  public refNameToTagName(refName: string) {
    // `%D` lists every decoration of the commit, so a tagged tip reads
    // `HEAD -> master, tag: <uuid>` and the tag has to be picked out of it
    const tagName =
      refName
        .split(',')
        .find((decoration) => decoration.trim().startsWith('tag: '))
        ?.trim()
        .slice('tag: '.length)
        .trim() ?? '';

    // Return null for anything else than UUIDs (tag names are UUIDs)
    if (tagName === '' || uuidSchema.safeParse(tagName).success === false) {
      return null;
    }

    return tagName;
  }

  /**
   * The ref names of `git ls-remote` output, without the peeled `^{}` lines
   * git prints for annotated tags
   */
  private advertisedRefNames(stdout: string): string[] {
    return stdout
      .split('\n')
      .map((line) => line.trim().split('\t')[1])
      .filter(
        (ref): ref is string =>
          ref !== undefined && ref !== '' && !ref.endsWith('^{}')
      );
  }

  /**
   * Reads the currently used version of Git
   *
   * This can help debugging
   */
  private async updateVersion(): Promise<void> {
    try {
      const result = await this.git('', ['--version']);
      this.version = result.stdout.replace('git version', '').trim();
    } catch {
      // Silently ignore - version is optional debug info
    }
  }

  /**
   * Reads the path to the executable of Git that is used
   *
   * This can help debugging, since dugite is shipping their own executable
   * but in some cases resolves another executable
   * @see https://github.com/desktop/dugite/blob/main/lib/git-environment.ts
   */
  private async updateGitPath(): Promise<void> {
    try {
      const result = await this.git('', ['--exec-path']);
      this.gitPath = result.stdout.trim();
    } catch {
      // Silently ignore - gitPath is optional debug info
    }
  }

  /**
   * A reference is used in Git to specify branches and tags.
   * This method checks if given name matches the required format
   *
   * @see https://git-scm.com/docs/git-check-ref-format
   */
  private async checkBranchOrTagName(
    path: string,
    name: string
  ): Promise<void> {
    await this.git(path, ['check-ref-format', '--allow-onelevel', name]);
  }

  /**
   * Writes the local git config of the repository: `push.autoSetupRemote`,
   * and `pull.rebase`, which makes every pull a rebase.
   *
   * No identity goes in. Core hands git the current User on every command
   * that records one, and a Project is changed through Core only.
   */
  private async setLocalConfig(path: string): Promise<void> {
    // By default new branches that are pushed are automatically tracking
    // their remote without the need of using the `--set-upstream` argument of `git push`
    const autoSetupRemoteArgs = [
      'config',
      '--local',
      'push.autoSetupRemote',
      'true',
    ];
    // By default `git pull` will try to rebase first
    // to reduce the amount of merge commits
    const pullRebaseArgs = ['config', '--local', 'pull.rebase', 'true'];

    await this.git(path, autoSetupRemoteArgs);
    await this.git(path, pullRebaseArgs);
  }

  /**
   * Type guard for GitCommit
   */
  private isGitCommit(obj: unknown): obj is GitCommit {
    return gitCommitSchema.safeParse(obj).success;
  }

  /**
   * The single choke point every git command goes through. Nothing should
   * call `gitExec` directly, or it loses all of this.
   *
   * The credential environment is built inside the queue, the command is
   * timed, redacted and logged at `info` or `debug`, and a non-zero exit is
   * classified into `Unauthorized` or `Internal`, unless `tolerateNonZero`
   * hands the result back for the caller to classify. A command whose
   * Cloud git token the git host refused runs once more, which asks again.
   *
   * @see ../../contributing/git-credentials.md
   */
  private async git(
    path: string,
    args: string[],
    options: GitCommandOptions = {}
  ): Promise<IGitStringResult> {
    const { tolerateNonZero, attributes, user, ...execOptions } = options;
    const identity = recordsGitIdentity(args)
      ? identityEnv(user === undefined ? await this.userService.get() : user)
      : {};
    const callerEnv = execOptions.env;
    // `--version` and `--exec-path` run no command, so they can never ask
    // for a credential, and the constructor's calls of them install nothing
    const hasCommand = args.some((arg) => !arg.startsWith('-'));
    const result = await this.queue.add(async () => {
      for (let attempt = 1; ; attempt += 1) {
        // Every other git invocation gets the credential environment, so
        // remote operations and on-demand LFS smudges authenticate the same
        // way and never prompt
        const invocation = await this.credentialRelay.begin(hasCommand);
        execOptions.env = { ...invocation.env, ...identity, ...callerEnv };
        const start = Date.now();
        let gitResult: IGitResult;
        let credentials: GitCredentialOutcome;
        try {
          gitResult = await gitExec(args, path, execOptions);
        } finally {
          credentials = invocation.finish();
        }
        const durationMs = Date.now() - start;
        if (
          gitResult.exitCode !== 0 &&
          credentials.isRetryable &&
          attempt === 1
        ) {
          this.logService.info({
            source: 'core',
            message: `Running "${redactedCommand(args)}" once more, because a git host refused the git token elek.io Cloud answered`,
            meta: { 'elek.git.command': redactedCommand(args) },
          });
          continue;
        }
        return { gitResult, durationMs, credentials };
      }
    });

    if (!result) {
      throw CoreError.internal(
        `Git ${this.version} (${this.gitPath}) command "${redactedCommand(
          args
        )}" executed for "${path}" failed to return a result`
      );
    }

    const command = redactedCommand(args);
    const record: LogProps = {
      source: 'core',
      message: `Executed "${command}" in ${result.durationMs}ms`,
      meta: {
        'elek.git.command': command,
        'elek.duration_ms': result.durationMs,
        ...attributes,
      },
    };
    if (isMutatingGitCommand(args)) {
      this.logService.info(record);
    } else {
      this.logService.debug(record);
    }

    // A program git could not even start, and a credential the helper
    // could not give, are never the caller's to classify, so both throw
    // whether or not a non-zero exit is tolerated
    if (result.gitResult.exitCode !== 0) {
      const stderr = result.gitResult.stderr.toString();
      const loadError = classifyLoadError(stderr);
      if (loadError) {
        throw loadError;
      }
      if (result.credentials.failure !== null) {
        throw result.credentials.failure;
      }
      // A grant taken back while Core runs leaves the token live, so the
      // git host answers as for a repository that does not exist
      if (parseError(stderr) === GitError.HTTPSRepositoryNotFound) {
        for (const [host, projectId] of result.credentials.answered) {
          this.credentialRelay.forget(host, projectId);
        }
      }
    }

    if (result.gitResult.exitCode !== 0 && tolerateNonZero !== true) {
      const authError = classifyAuthError(
        result.gitResult.stderr.toString(),
        this.credentialRelay.hasRemoteToken
      );
      if (authError) {
        throw authError;
      }
      throw CoreError.internal(
        `Git ${this.version} (${this.gitPath}) command "${command}" executed for "${path}" failed with exit code "${result.gitResult.exitCode}"`,
        gitOutputCause(
          result.gitResult.stderr.toString(),
          result.gitResult.stdout.toString()
        )
      );
    }

    return {
      ...result.gitResult,
      stdout: result.gitResult.stdout.toString(),
      stderr: result.gitResult.stderr.toString(),
    };
  }
}

/**
 * Options for the internal `git` runner: dugite's execution options plus
 * `tolerateNonZero`, which returns the result on a non-zero exit instead of
 * throwing, so the caller can classify the failure itself (used by `rebase`
 * and `push`), and `attributes` for the log record. Both are stripped
 * before the options reach dugite.
 */
type GitCommandOptions = IGitExecutionOptions & {
  tolerateNonZero?: boolean;
  /**
   * Attributes added to the log record of this command, for the context
   * only the caller has. Stripped before the options reach dugite.
   */
  attributes?: LogAttributes;
  /**
   * The User a caller already read, so the identity is not read a second
   * time. Stripped before the options reach dugite.
   */
  user?: User | null;
};

/**
 * The User as the author and the committer of whatever a command writes,
 * through the environment, which never reaches a command line or a log.
 * Empty without a User, which leaves git to the machine's identity. Every
 * write Core makes commits first and `commit()` refuses without a User, so
 * only a rebase replaying commits made under an earlier User gets here.
 */
function identityEnv(user: User | null): Record<string, string> {
  if (user === null) {
    return {};
  }
  return {
    GIT_AUTHOR_NAME: user.name,
    GIT_AUTHOR_EMAIL: user.email,
    GIT_COMMITTER_NAME: user.name,
    GIT_COMMITTER_EMAIL: user.email,
  };
}
