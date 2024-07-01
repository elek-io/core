import { GitProcess, type IGitResult } from 'dugite';
import { EOL } from 'os';
import PQueue from 'p-queue';
import GitError from '../error/GitError.js';
import NoCurrentUserError from '../error/NoCurrentUserError.js';
import { uuidSchema } from '../schema/baseSchema.js';
import type { ElekIoCoreOptions } from '../schema/coreSchema.js';
import {
  gitCommitSchema,
  type GitCloneOptions,
  type GitCommit,
  type GitInitOptions,
  type GitLogOptions,
  type GitSwitchOptions,
} from '../schema/gitSchema.js';
import GitTagService from './GitTagService.js';
import UserService from './UserService.js';

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
export default class GitService {
  private version: string | null;
  private gitPath: string | null;
  private queue: PQueue;
  private gitTagService: GitTagService;
  private userService: UserService;

  public constructor(options: ElekIoCoreOptions, userService: UserService) {
    this.version = null;
    this.gitPath = null;
    this.queue = new PQueue({
      concurrency: 1, // No concurrency because git operations are sequencial
    });
    this.gitTagService = new GitTagService(options, this.git);
    this.userService = userService;

    this.updateVersion();
    this.updateGitPath();
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
    await this.installLfs(path);
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
    const args = ['add', '--', ...files];

    await this.git(path, args);
  }

  public branches = {
    /**
     * List branches
     *
     * @see https://www.git-scm.com/docs/git-branch
     *
     * @param path  Path to the repository
     */
    list: async (path: string) => {
      const args = ['branch', '--list', '--all'];
      const result = await this.git(path, args);

      const normalizedLinesArr = result.stdout
        .split(EOL)
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
      return {
        local,
        remote,
      };
    },
    /**
     * Returns the name of the current branch. In detached HEAD state, an empty string is returned.
     *
     * @see https://www.git-scm.com/docs/git-branch#Documentation/git-branch.txt---show-current
     *
     * @param path  Path to the repository
     */
    current: async (path: string) => {
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
     * @param name    Name of the branch to switch to
     * @param options Options specific to the switch operation
     */
    switch: async (
      path: string,
      name: string,
      options?: Partial<GitSwitchOptions>
    ) => {
      await this.checkBranchOrTagName(path, name);

      let args = ['switch'];

      if (options?.isNew === true) {
        args = [...args, '--create', name];
      } else {
        args = [...args, name];
      }

      await this.git(path, args);
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
    list: async (path: string) => {
      const args = ['remote'];
      const result = await this.git(path, args);
      const normalizedLinesArr = result.stdout.split(EOL).filter((line) => {
        return line.trim() !== '';
      });

      return normalizedLinesArr;
    },
    /**
     * Returns true if the `origin` remote exists, otherwise false
     *
     * @param path  Path to the repository
     */
    hasOrigin: async (path: string) => {
      const remotes = await this.remotes.list(path);

      if (remotes.includes('origin')) {
        return true;
      }
      return false;
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
    addOrigin: async (path: string, url: string) => {
      const args = ['remote', 'add', 'origin', url];
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
    getOriginUrl: async (path: string) => {
      const args = ['remote', 'get-url', 'origin'];
      const result = (await this.git(path, args)).stdout.trim();

      return result.length === 0 ? null : result;
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
    setOriginUrl: async (path: string, url: string) => {
      const args = ['remote', 'set-url', 'origin', url];
      await this.git(path, args);
    },
  };

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
  public async reset(path: string, mode: 'soft' | 'hard', commit: string) {
    const args = ['reset', `--${mode}`, commit];
    await this.git(path, args);
  }

  /**
   * Restore working tree files
   *
   * @see https://git-scm.com/docs/git-restore/
   *
   * @todo It's probably a good idea to not use restore
   * for a use case where someone just wants to have a look
   * and maybe copy something from a deleted file.
   * We should use `checkout` without `add .` and `commit` for that
   *
   * @param path    Path to the repository
   * @param source  Git commit SHA or tag name to restore to
   * @param files   Files to restore
   */
  // public async restore(
  //   path: string,
  //   source: string,
  //   files: string[]
  // ): Promise<void> {
  //   const args = ['restore', `--source=${source}`, ...files];
  //   await this.git(path, args);
  // }

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
   * @see https://git-scm.com/docs/git-push
   *
   * @param path Path to the repository
   */
  public async push(
    path: string,
    // branch: string,
    options?: Partial<{ all: boolean; force: boolean }>
  ): Promise<void> {
    let args = ['push', 'origin'];

    // if (options?.trackRemoteBranch === true) {
    //   args = [...args, '--set-upstream'];
    // }

    // args = [...args, 'origin'];

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
   * @param message A message that describes the changes
   */
  public async commit(path: string, message: string): Promise<void> {
    const user = await this.userService.get();
    if (!user) {
      throw new NoCurrentUserError();
    }

    const args = [
      'commit',
      `--message=${message}`,
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

    const result = await this.git(path, [
      ...args,
      '--format=%H|%s|%an|%ae|%at|%D',
    ]);

    const noEmptyLinesArr = result.stdout.split(EOL).filter((line) => {
      return line.trim() !== '';
    });

    const lineObjArr = noEmptyLinesArr.map((line) => {
      const lineArray = line.split('|');
      return {
        hash: lineArray[0],
        message: lineArray[1],
        author: {
          name: lineArray[2],
          email: lineArray[3],
        },
        timestamp: parseInt(lineArray[4]),
        tag: this.refNameToTagName(lineArray[5]),
      };
    });

    return lineObjArr.filter(this.isGitCommit.bind(this));
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
   * Returns a timestamp of given files creation
   *
   * Git only returns the timestamp the file was added,
   * which could be different from the file being created.
   * But since file operations will always be committed
   * immediately, this is practically the same.
   *
   * @param path Path to the repository
   * @param file File to get timestamp from
   */
  public async getFileCreatedTimestamp(path: string, file: string) {
    const result = await this.git(path, [
      'log',
      '--diff-filter=A',
      '--follow',
      '--format=%at',
      '--max-count=1',
      '--',
      file,
    ]);
    return parseInt(result.stdout);
  }

  /**
   * Returns a timestamp of the files last modification
   *
   * @param path Path to the repository
   * @param file File to get timestamp from
   */
  public async getFileLastUpdatedTimestamp(path: string, file: string) {
    const result = await this.git(path, [
      'log',
      '--follow',
      '--format=%at',
      '--max-count=1',
      '--',
      file,
    ]);
    return parseInt(result.stdout);
  }

  /**
   * Returns created and updated timestamps from given file
   *
   * @param path Path to the project
   * @param file Path to the file
   */
  public async getFileCreatedUpdatedMeta(path: string, file: string) {
    const meta = await Promise.all([
      this.getFileCreatedTimestamp(path, file),
      this.getFileLastUpdatedTimestamp(path, file),
    ]);
    return {
      created: meta[0],
      updated: meta[1],
    };
  }

  /**
   * Reads the currently used version of Git
   *
   * This can help debugging
   */
  private async updateVersion(): Promise<void> {
    const result = await this.git('', ['--version']);
    this.version = result.stdout.replace('git version', '').trim();
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
    this.gitPath = result.stdout.trim();
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
  private async checkBranchOrTagName(path: string, name: string) {
    await this.git(path, ['check-ref-format', '--allow-onelevel', name]);
  }

  /**
   * Installs LFS support and starts tracking
   * all files inside the lfs folder
   *
   * @param path Path to the repository
   */
  private async installLfs(path: string): Promise<void> {
    await this.git(path, ['lfs', 'install']);
    await this.git(path, ['lfs', 'track', 'lfs/*']);
  }

  /**
   * Sets the git config of given local repository from ElekIoCoreOptions
   *
   * @param path Path to the repository
   */
  private async setLocalConfig(path: string) {
    const user = await this.userService.get();
    if (!user) {
      throw new NoCurrentUserError();
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

    await this.git(path, userNameArgs);
    await this.git(path, userEmailArgs);
    await this.git(path, autoSetupRemoteArgs);
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
  private async git(path: string, args: string[]): Promise<IGitResult> {
    const result = await this.queue.add(() =>
      GitProcess.exec(args, path, {
        env: {
          // @todo Nasty stuff - remove after update to dugite with git > v2.45.2 once available
          // @see https://github.com/git-lfs/git-lfs/issues/5749
          GIT_CLONE_PROTECTION_ACTIVE: 'false',
        },
      })
    );
    if (!result) {
      throw new GitError(
        `Git ${this.version} (${this.gitPath}) command "git ${args.join(
          ' '
        )}" failed to return a result`
      );
    }
    if (result.exitCode !== 0) {
      throw new GitError(
        `Git ${this.version} (${this.gitPath}) command "git ${args.join(
          ' '
        )}" failed with exit code "${result.exitCode}" and message "${
          result.stderr
        }"`
      );
    }

    return result;
  }
}
