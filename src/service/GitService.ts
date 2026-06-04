import type { ChildProcess } from 'node:child_process';
import type { IGitExecutionOptions, IGitStringResult } from 'dugite';
import { exec as gitExec } from 'dugite';
import PQueue from 'p-queue';
import Path from 'node:path';
import { CoreError } from '../util/shared.js';
import type { GitMergeOptions, GitMessage } from '../schema/index.js';
import {
  gitCommitSchema,
  gitMessageSchema,
  uuidSchema,
  type ElekIoCoreOptions,
  type GitCloneOptions,
  type GitCommit,
  type GitInitOptions,
  type GitLogOptions,
  type GitSwitchOptions,
} from '../schema/index.js';
import { datetime } from '../util/shared.js';
import { GitTagService } from './GitTagService.js';
import type { LogService } from './LogService.js';
import type { UserService } from './UserService.js';
import type { LogProps } from '../schema/index.js';

/**
 * Service that manages Git functionality
 *
 * Uses dugite Node.js bindings for Git to be fully compatible
 * and be able to leverage Git LFS functionality
 * @see https://github.com/desktop/dugite
 *
 * Heavily inspired by the GitHub Desktop app
 * @see https://github.com/desktop/desktop
 *
 * Git operations are sequential!
 * We use a FIFO queue to translate async calls
 * into a sequence of git operations
 *
 * @todo All public methods should recieve only a single object as parameter and the type should be defined through the shared library to be accessible in Core and Client
 */
export class GitService {
  private version: string | null;
  private gitPath: string | null;
  private queue: PQueue;
  private logService: LogService;
  private gitTagService: GitTagService;
  private userService: UserService;

  public constructor(
    options: ElekIoCoreOptions,
    logService: LogService,
    userService: UserService
  ) {
    this.version = null;
    this.gitPath = null;
    this.queue = new PQueue({
      concurrency: 1, // No concurrency because git operations are sequencial
    });
    this.gitTagService = new GitTagService(
      options,
      this.git.bind(this),
      logService
    );
    this.logService = logService;
    this.userService = userService;

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
   * Create an empty Git repository or reinitialize an existing one
   *
   * @see https://git-scm.com/docs/git-init
   *
   * @param path    Path to initialize in. Fails if path does not exist
   * @param options Options specific to the init operation
   */
  public async init(
    path: string,
    options?: Partial<GitInitOptions>
  ): Promise<void> {
    let args = ['init'];

    if (options?.initialBranch) {
      args = [...args, `--initial-branch=${options.initialBranch}`];
    }

    await this.git(path, args);
    await this.setLocalConfig(path);
    await this.lfs.install(path);
  }

  /**
   * Clone a repository into a directory
   *
   * @see https://git-scm.com/docs/git-clone
   *
   * @todo Implement progress callback / events
   *
   * @param url     The remote repository URL to clone from
   * @param path    The destination path for the cloned repository.
   *                Which is only working if the directory is existing and empty.
   * @param options Options specific to the clone operation
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
    await this.setLocalConfig(path);

    // A bare clone has no working tree, so LFS materialization does not apply
    // (and would error). A bare repository is a remote, not a working Project.
    if (options?.bare !== true) {
      // `git clone` only fetches LFS objects for the checked-out ref (if any).
      // Install LFS, then fetch the whole history into the local store and
      // materialize the working tree, so all Assets are available offline.
      await this.lfs.install(path);
      await this.lfs.fetchAll(path);
      await this.lfs.checkout(path);
    }
  }

  /**
   * Add file contents to the index
   *
   * @see https://git-scm.com/docs/git-add
   *
   * @param path  Path to the repository
   * @param files Files to add
   */
  public async add(path: string, files: string[]): Promise<void> {
    const relativePathsFromRepositoryRoot = files.map((filePath) => {
      return filePath.replace(`${path}${Path.sep}`, '');
    });

    const args = ['add', '--', ...relativePathsFromRepositoryRoot];

    await this.git(path, args);
  }

  public async status(
    path: string
  ): Promise<{ filePath: string | undefined }[]> {
    const args = ['status', '--porcelain=2'];
    const result = await this.git(path, args);
    return result.stdout
      .split('\n')
      .filter((line) => {
        return line.trim() !== '';
      })
      .map((line) => {
        const lineArr = line.trim().split(' ');

        return {
          filePath: lineArr[8],
        };
      });
  }

  public branches = {
    /**
     * List branches
     *
     * @see https://www.git-scm.com/docs/git-branch
     *
     * @param path  Path to the repository
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
     *
     * @param path  Path to the repository
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
     *
     * @param path    Path to the repository
     * @param branch  Name of the branch to switch to
     * @param options Options specific to the switch operation
     */
    switch: async (
      path: string,
      branch: string,
      options?: GitSwitchOptions
    ): Promise<void> => {
      await this.checkBranchOrTagName(path, branch);

      let args = ['switch'];

      if (options?.isNew === true) {
        args = [...args, '--create', branch];
      } else {
        args = [...args, branch];
      }

      await this.git(path, args);
    },
    /**
     * Delete a branch
     *
     * @see https://git-scm.com/docs/git-branch#Documentation/git-branch.txt---delete
     *
     * @param path Path to the repository
     * @param branch Name of the branch to delete
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
     *
     * @param path  Path to the repository
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
     *
     * @param path  Path to the repository
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
     *
     * @param path  Path to the repository
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
     * Adds the `origin` remote with given URL
     *
     * Throws if `origin` remote is added already.
     *
     * @see https://git-scm.com/docs/git-remote#Documentation/git-remote.txt-emaddem
     *
     * @param path  Path to the repository
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
     *
     * @param path  Path to the repository
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
     *
     * @param path  Path to the repository
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
     *
     * @param path  Path to the repository
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
     *
     * @param path  Path to the repository
     */
    fetchAll: async (path: string): Promise<void> => {
      await this.git(path, ['lfs', 'fetch', '--all']);
    },
    /**
     * Materializes (smudges) working-tree files from the local LFS store
     *
     * @see https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-checkout.adoc
     *
     * @param path  Path to the repository
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
     *
     * @param content  The content to check
     */
    isPointer: (content: string): boolean => {
      return content.startsWith('version https://git-lfs.github.com/spec/v1');
    },
    /**
     * Converts an LFS pointer into the real file content
     *
     * Reads a pointer on stdin and writes the bytes to stdout. With the
     * fetch-all guarantee the object is always present locally, so this does
     * not reach the network. Used to resolve a binary asset read from history.
     *
     * @see https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-smudge.adoc
     *
     * @param path      Path to the repository
     * @param pointer   The LFS pointer content to resolve
     * @param filePath  Path of the file the pointer belongs to (used for the progress bar)
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
     * auth outage - where plain git transport also fails - is surfaced
     * unchanged.
     *
     * @see https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-push.adoc
     *
     * @param path    Path to the repository
     * @param options Options specific to the push operation
     */
    push: async (
      path: string,
      options?: Partial<{ all: boolean }>
    ): Promise<void> => {
      const branch = await this.branches.current(path); // '' in detached HEAD

      // Synopsis: `git lfs push [options] <remote> [<ref>...]` - so `--all` is
      // an option and must precede the remote; the branch form is positional.
      const args =
        options?.all === true || branch === ''
          ? ['lfs', 'push', '--all', 'origin']
          : ['lfs', 'push', 'origin', branch];

      try {
        await this.git(path, args);
      } catch (error) {
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
   * Join two development histories together
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
  }

  /**
   * Reset current HEAD to the specified state
   *
   * @todo maybe add more options
   * @see https://git-scm.com/docs/git-reset
   *
   * @param path    Path to the repository
   * @param mode    Modifies the working tree depending on given mode
   * @param commit  Resets the current branch head to this commit / tag
   */
  public async reset(
    path: string,
    mode: 'soft' | 'hard',
    commit: string
  ): Promise<void> {
    const args = ['reset', `--${mode}`, commit];
    await this.git(path, args);
  }

  /**
   * Download objects and refs from remote `origin`
   *
   * @see https://www.git-scm.com/docs/git-fetch
   *
   * @param path Path to the repository
   */
  public async fetch(path: string): Promise<void> {
    const args = ['fetch'];
    await this.git(path, args);
  }

  /**
   * Fetch from and integrate (rebase or merge) with a local branch
   *
   * @see https://git-scm.com/docs/git-pull
   *
   * @param path Path to the repository
   */
  public async pull(path: string): Promise<void> {
    const args = ['pull'];
    await this.git(path, args);
  }

  /**
   * Update remote refs along with associated objects to remote `origin`
   *
   * The LFS objects are uploaded first in an explicit `git lfs push`, so that
   * an upload failure is attributable and can be turned into a descriptive
   * error. The ordinary ref push then runs with `--no-verify` to skip the
   * now-redundant pre-push hook.
   *
   * @see https://git-scm.com/docs/git-push
   *
   * @param path    Path to the repository
   * @param options Options specific to the push operation
   */
  public async push(
    path: string,
    options?: Partial<{ all: boolean; force: boolean }>
  ): Promise<void> {
    // 1. Upload the LFS objects first so an upload failure is attributable.
    await this.lfs.push(path, { all: options?.all === true });

    // 2. Push the refs. The objects are already uploaded, so skip the pre-push
    // hook with `--no-verify` to avoid a redundant LFS verification round-trip.
    let args = ['push', 'origin', '--no-verify'];

    if (options?.all === true) {
      args = [...args, '--all'];
    }

    if (options?.force === true) {
      args = [...args, '--force'];
    }

    await this.git(path, args);
  }

  /**
   * Record changes to the repository
   *
   * @see https://git-scm.com/docs/git-commit
   *
   * @param path    Path to the repository
   * @param message An object describing the changes
   */
  public async commit(path: string, message: GitMessage): Promise<void> {
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

    const args = [
      'commit',
      `--message=${fullMessage}`,
      `--author=${user.name} <${user.email}>`,
    ];
    await this.git(path, args);
  }

  /**
   * Gets local commit history
   *
   * @see https://git-scm.com/docs/git-log
   *
   * @todo Check if there is a need to trim the git commit message of chars
   * @todo Use this method in a service. Decide if we need a HistoryService for example
   *
   * @param path    Path to the repository
   * @param options Options specific to the log operation
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
   * @see https://git-scm.com/docs/git-show
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
    const args = ['show', `${commitHash}:${normalizedPath}`];
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
   * Lists directory entries at a specific commit
   *
   * Useful for discovering what files/folders existed at a past commit,
   * e.g. to detect deleted collections when comparing branches.
   *
   * @see https://git-scm.com/docs/git-ls-tree
   *
   * @param path      Path to the repository
   * @param treePath  Relative path within the repository to list
   * @param commitRef Commit hash, branch name, or other git ref
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

  public refNameToTagName(refName: string) {
    const tagName = refName.replace('tag: ', '').trim();

    // Return null for anything else than UUIDs (tag names are UUIDs)
    if (tagName === '' || uuidSchema.safeParse(tagName).success === false) {
      return null;
    }

    return tagName;
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
   *
   * @param path Path to the repository
   * @param name Name to check
   */
  private async checkBranchOrTagName(
    path: string,
    name: string
  ): Promise<void> {
    await this.git(path, ['check-ref-format', '--allow-onelevel', name]);
  }

  /**
   * Sets the git config of given local repository from ElekIoCoreOptions
   *
   * @param path Path to the repository
   */
  private async setLocalConfig(path: string): Promise<void> {
    const user = await this.userService.get();

    if (!user) {
      throw CoreError.unauthorized(
        'No user is set in Core. Please set a User before doing any git operations.'
      );
    }

    // Setup the local User
    const userNameArgs = ['config', '--local', 'user.name', user.name];
    const userEmailArgs = ['config', '--local', 'user.email', user.email];
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

    await this.git(path, userNameArgs);
    await this.git(path, userEmailArgs);
    await this.git(path, autoSetupRemoteArgs);
    await this.git(path, pullRebaseArgs);
  }

  /**
   * Type guard for GitCommit
   *
   * @param obj The object to check
   */
  private isGitCommit(obj: unknown): obj is GitCommit {
    return gitCommitSchema.safeParse(obj).success;
  }

  /**
   * Wraps the execution of any git command
   * to use a FIFO queue for sequential processing
   *
   * @param path Path to the repository
   * @param args Arguments to append after the `git` command
   */
  private async git(
    path: string,
    args: string[],
    options?: IGitExecutionOptions
  ): Promise<IGitStringResult> {
    const result = await this.queue.add(async () => {
      const start = Date.now();
      const gitResult = await gitExec(args, path, options);
      const durationMs = Date.now() - start;
      return { gitResult, durationMs };
    });

    if (!result) {
      throw CoreError.internal(
        `Git ${this.version} (${this.gitPath}) command "git ${args.join(
          ' '
        )}" executed for "${path}" failed to return a result`
      );
    }

    const gitLog: LogProps = {
      source: 'core',
      message: `Executed "git ${args.join(' ')}" in ${result.durationMs}ms`,
      meta: { command: `git ${args.join(' ')}` },
    };
    if (result.durationMs >= 100) {
      this.logService.warn(gitLog);
    } else {
      this.logService.debug(gitLog);
    }

    if (result.gitResult.exitCode !== 0) {
      throw CoreError.internal(
        `Git ${this.version} (${this.gitPath}) command "git ${args.join(
          ' '
        )}" executed for "${path}" failed with exit code "${
          result.gitResult.exitCode
        }" and message "${
          result.gitResult.stderr.toString().trim() ||
          result.gitResult.stdout.toString().trim()
        }"`
      );
    }

    return {
      ...result.gitResult,
      stdout: result.gitResult.stdout.toString(),
      stderr: result.gitResult.stderr.toString(),
    };
  }
}
