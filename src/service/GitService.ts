import type { ChildProcess } from 'node:child_process';
import type { IGitExecutionOptions, IGitStringResult } from 'dugite';
import { exec as gitExec } from 'dugite';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import PQueue from 'p-queue';
import Path from 'node:path';
import { CoreErrors, parseSchema, type CoreResult } from '../util/shared.js';
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
  public init(
    path: string,
    options?: Partial<GitInitOptions>
  ): CoreResult<void> {
    let args = ['init'];

    if (options?.initialBranch) {
      args = [...args, `--initial-branch=${options.initialBranch}`];
    }

    return this.git(path, args)
      .andThen(() => this.setLocalConfig(path))
      .map(() => undefined);
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
  public clone(
    url: string,
    path: string,
    options?: Partial<GitCloneOptions>
  ): CoreResult<void> {
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

    return this.git('', [...args, url, path])
      .andThen(() => this.setLocalConfig(path))
      .map(() => undefined);
  }

  /**
   * Add file contents to the index
   *
   * @see https://git-scm.com/docs/git-add
   *
   * @param path  Path to the repository
   * @param files Files to add
   */
  public add(path: string, files: string[]): CoreResult<void> {
    const relativePathsFromRepositoryRoot = files.map((filePath) => {
      return filePath.replace(`${path}${Path.sep}`, '');
    });

    const args = ['add', '--', ...relativePathsFromRepositoryRoot];

    return this.git(path, args).map(() => undefined);
  }

  public status(path: string): CoreResult<{ filePath: string | undefined }[]> {
    const args = ['status', '--porcelain=2'];
    return this.git(path, args).map((result) => {
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
    list: (path: string): CoreResult<{ local: string[]; remote: string[] }> => {
      const args = ['branch', '--list', '--all'];
      return this.git(path, args).map((result) => {
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
      });
    },
    /**
     * Returns the name of the current branch. In detached HEAD state, an empty string is returned.
     *
     * @see https://www.git-scm.com/docs/git-branch#Documentation/git-branch.txt---show-current
     *
     * @param path  Path to the repository
     */
    current: (path: string): CoreResult<string> => {
      const args = ['branch', '--show-current'];
      return this.git(path, args).map((result) => result.stdout.trim());
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
    switch: (
      path: string,
      branch: string,
      options?: GitSwitchOptions
    ): CoreResult<void> => {
      return this.checkBranchOrTagName(path, branch).andThen(() => {
        let args = ['switch'];

        if (options?.isNew === true) {
          args = [...args, '--create', branch];
        } else {
          args = [...args, branch];
        }

        return this.git(path, args).map(() => undefined);
      });
    },
    /**
     * Delete a branch
     *
     * @see https://git-scm.com/docs/git-branch#Documentation/git-branch.txt---delete
     *
     * @param path Path to the repository
     * @param branch Name of the branch to delete
     */
    delete: (
      path: string,
      branch: string,
      force?: boolean
    ): CoreResult<void> => {
      let args = ['branch', '--delete'];

      if (force === true) {
        args = [...args, '--force'];
      }

      return this.git(path, [...args, branch]).map(() => undefined);
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
    list: (path: string): CoreResult<string[]> => {
      const args = ['remote'];
      return this.git(path, args).map((result) => {
        return result.stdout.split('\n').filter((line) => {
          return line.trim() !== '';
        });
      });
    },
    /**
     * Returns true if the `origin` remote exists, otherwise false
     *
     * @param path  Path to the repository
     */
    hasOrigin: (path: string): CoreResult<boolean> => {
      return this.remotes.list(path).map((remotes) => remotes.includes('origin'));
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
    addOrigin: (path: string, url: string): CoreResult<void> => {
      const args = ['remote', 'add', 'origin', url.trim()];
      return this.git(path, args).map(() => undefined);
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
    getOriginUrl: (path: string): CoreResult<string | null> => {
      const args = ['remote', 'get-url', 'origin'];
      return this.git(path, args).map((result) => {
        const url = result.stdout.trim();
        return url.length === 0 ? null : url;
      });
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
    setOriginUrl: (path: string, url: string): CoreResult<void> => {
      const args = ['remote', 'set-url', 'origin', url.trim()];
      return this.git(path, args).map(() => undefined);
    },
  };

  /**
   * Join two development histories together
   *
   * @see https://git-scm.com/docs/git-merge
   */
  public merge(
    path: string,
    branch: string,
    options?: Partial<GitMergeOptions>
  ): CoreResult<void> {
    let args = ['merge'];

    if (options?.squash === true) {
      args = [...args, '--squash'];
    }

    args = [...args, branch];

    return this.git(path, args).map(() => undefined);
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
  public reset(
    path: string,
    mode: 'soft' | 'hard',
    commit: string
  ): CoreResult<void> {
    const args = ['reset', `--${mode}`, commit];
    return this.git(path, args).map(() => undefined);
  }

  /**
   * Download objects and refs from remote `origin`
   *
   * @see https://www.git-scm.com/docs/git-fetch
   *
   * @param path Path to the repository
   */
  public fetch(path: string): CoreResult<void> {
    const args = ['fetch'];
    return this.git(path, args).map(() => undefined);
  }

  /**
   * Fetch from and integrate (rebase or merge) with a local branch
   *
   * @see https://git-scm.com/docs/git-pull
   *
   * @param path Path to the repository
   */
  public pull(path: string): CoreResult<void> {
    const args = ['pull'];
    return this.git(path, args).map(() => undefined);
  }

  /**
   * Update remote refs along with associated objects to remote `origin`
   *
   * @see https://git-scm.com/docs/git-push
   *
   * @param path Path to the repository
   */
  public push(
    path: string,
    options?: Partial<{ all: boolean; force: boolean }>
  ): CoreResult<void> {
    let args = ['push', 'origin'];

    if (options?.all === true) {
      args = [...args, '--all'];
    }

    if (options?.force === true) {
      args = [...args, '--force'];
    }

    return this.git(path, args).map(() => undefined);
  }

  /**
   * Record changes to the repository
   *
   * @see https://git-scm.com/docs/git-commit
   *
   * @param path    Path to the repository
   * @param message An object describing the changes
   */
  public commit(path: string, message: GitMessage): CoreResult<void> {
    const validated = parseSchema(gitMessageSchema, message);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    return this.userService.get().andThen((user) => {
      if (!user) {
        return errAsync(
          CoreErrors.unauthorized(
            'No user is set in Core. Please set a User before doing any git operations.'
          )
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
      return this.git(path, args).map(() => undefined);
    });
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
  public log(
    path: string,
    options?: Partial<GitLogOptions>
  ): CoreResult<GitCommit[]> {
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

    return this.git(path, args).andThen((result) => {
      // Trailer values from %(trailers:key=...,valueonly) include trailing newlines.
      // Collapsing "\n|" into "|" rejoins the pipe-delimited fields into single lines.
      const cleaned = result.stdout.replace(/\n\|/g, '|');

      const noEmptyLinesArr = cleaned.split('\n').filter((line) => {
        return line.trim() !== '';
      });

      return ResultAsync.fromSafePromise(
        Promise.all(
          noEmptyLinesArr.map(async (line) => {
            const lineArray = line.split('|');
            const tagId = this.refNameToTagName(lineArray[8]?.trim() || '');
            let tag = null;
            if (tagId) {
              const tagResult = await this.tags.read({ path, id: tagId });
              tag = tagResult.isOk() ? tagResult.value : null;
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
        )
      ).map((lineObjArr) =>
        lineObjArr.filter((obj) => this.isGitCommit(obj))
      );
    });
  }

  /**
   * Retrieves the content of a file at a specific commit
   *
   * @see https://git-scm.com/docs/git-show
   */
  public getFileContentAtCommit(
    path: string,
    filePath: string,
    commitHash: string,
    encoding: 'utf8' | 'binary' = 'utf8'
  ): CoreResult<string> {
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

    return this.git(path, args, {
      processCallback: setEncoding,
    }).map((result) => result.stdout);
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
  public listTreeAtCommit(
    path: string,
    treePath: string,
    commitRef: string
  ): CoreResult<string[]> {
    const relativeTreePath = treePath.replace(`${path}${Path.sep}`, '');
    const normalizedPath = relativeTreePath.split('\\').join('/');
    const args = ['ls-tree', '--name-only', commitRef, `${normalizedPath}/`];

    return this.git(path, args)
      .map((result) =>
        result.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '')
          .map((entry) => {
            // ls-tree returns paths relative to repo root like "collections/uuid"
            // Extract just the last segment (the folder/file name)
            const parts = entry.split('/');
            return parts[parts.length - 1] || entry;
          })
      )
      .orElse(() =>
        // If the path or ref doesn't exist (e.g. first release), return empty.
        okAsync([])
      );
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
    const result = await this.git('', ['--version']);
    if (result.isOk()) {
      this.version = result.value.stdout.replace('git version', '').trim();
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
    const result = await this.git('', ['--exec-path']);
    if (result.isOk()) {
      this.gitPath = result.value.stdout.trim();
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
  private checkBranchOrTagName(
    path: string,
    name: string
  ): CoreResult<void> {
    return this.git(path, [
      'check-ref-format',
      '--allow-onelevel',
      name,
    ]).map(() => undefined);
  }

  /**
   * Sets the git config of given local repository from ElekIoCoreOptions
   *
   * @param path Path to the repository
   */
  private setLocalConfig(path: string): CoreResult<void> {
    return this.userService.get().andThen((user) => {
      if (!user) {
        return errAsync(
          CoreErrors.unauthorized(
            'No user is set in Core. Please set a User before doing any git operations.'
          )
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

      return this.git(path, userNameArgs)
        .andThen(() => this.git(path, userEmailArgs))
        .andThen(() => this.git(path, autoSetupRemoteArgs))
        .andThen(() => this.git(path, pullRebaseArgs))
        .map(() => undefined);
    });
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
  private git(
    path: string,
    args: string[],
    options?: IGitExecutionOptions
  ): CoreResult<IGitStringResult> {
    return ResultAsync.fromPromise(
      this.queue.add(async () => {
        const start = Date.now();
        const gitResult = await gitExec(args, path, options);
        const durationMs = Date.now() - start;
        return { gitResult, durationMs };
      }),
      CoreErrors.fromUnknown
    ).andThen((result) => {
      if (!result) {
        return errAsync(
          CoreErrors.internal(
            `Git ${this.version} (${this.gitPath}) command "git ${args.join(
              ' '
            )}" executed for "${path}" failed to return a result`
          )
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
        return errAsync(
          CoreErrors.internal(
            `Git ${this.version} (${this.gitPath}) command "git ${args.join(
              ' '
            )}" executed for "${path}" failed with exit code "${
              result.gitResult.exitCode
            }" and message "${
              result.gitResult.stderr.toString().trim() ||
              result.gitResult.stdout.toString().trim()
            }"`
          )
        );
      }

      return okAsync({
        ...result.gitResult,
        stdout: result.gitResult.stdout.toString(),
        stderr: result.gitResult.stderr.toString(),
      });
    });
  }
}
