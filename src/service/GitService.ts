import Util from '../util';
import { GitProcess, IGitResult } from 'dugite';
import AbstractService from './AbstractService';
import EventService from './EventService';
import { ElekIoCoreOptions } from '../../type/general';
import { ServiceType } from '../../type/service';
import { GitCloneOptions, GitCommit, GitInitOptions, GitLogOptions, GitSwitchOptions, GitTag } from '../../type/git';
import GitError from '../error/GitError';
import LogService from './LogService';

/**
 * Service that manages Git functionality
 * 
 * Uses dugite Node.js bindings for Git to be fully compatible
 * and be able to leverage Git LFS functionality
 * @see https://github.com/desktop/dugite
 * 
 * Heavily inspired by the GitHub Desktop app
 * @see https://github.com/desktop/desktop
 */
export default class GitService extends AbstractService {
  private logService: LogService;
  private eventService: EventService;

  public constructor(options: ElekIoCoreOptions, logService: LogService, eventService: EventService) {
    super(ServiceType.GIT, options);

    this.logService = logService;
    this.eventService = eventService;
  }

  /**
   * Returns the currently used version of Git
   * 
   * @param path Path to the repository
   */
  private async version(path: string): Promise<string> {
    const result = await this.git(path, ['--version']);
    return result.stdout.replace('git version', '').trim();
  }

  /**
   * Create an empty Git repository or reinitialize an existing one
   * 
   * @see https://git-scm.com/docs/git-init
   * 
   * @param path Path to initialize in. Fails if path does not exist
   * @param options Options specific to the init operation
   */
  public async init(path: string, options?: Partial<GitInitOptions>): Promise<void> {
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
   * @param url The remote repository URL to clone from
   * @param path The destination path for the cloned repository.
   * Which is only working if the directory is existing and empty.
   * @param options Options specific to the clone operation
   */
  public async clone(url: string, path: string, options?: Partial<GitCloneOptions>): Promise<void> {
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

    await this.git(path, [...args, url, '.']);
    await this.setLocalConfig(path);
  }

  /**
   * Add file contents to the index
   * 
   * @see https://git-scm.com/docs/git-add
   * 
   * @param path Path to the repository
   * @param files Files to add
   */
  public async add(path: string, files: string[]): Promise<void> {
    const args = ['add', '--', ...files];

    await this.git(path, args);
  }

  /**
   * Switch branches
   * 
   * @see https://git-scm.com/docs/git-switch/
   * 
   * @param path Path to the repository
   * @param name Name of the branch to switch to
   * @param options Options specific to the switch operation
   */
  public async switch(path: string, name: string, options?: Partial<GitSwitchOptions>): Promise<void> {
    await this.checkBranchOrTagName(path, name);
    
    let args = ['switch'];

    if (options?.isNew === true) {
      args = [...args, '--create', name];
    } else {
      args = [...args, name];
    }

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
   * @param path Path to the repository
   * @param source Git commit SHA or tag name to restore to
   * @param files Files to restore
   */
  public async restore(path: string, source: string, files: string[]): Promise<void> {
    const args = ['restore', `--source=${source}`, ...files];
    await this.git(path, args);
  }

  /**
   * Fetch from and integrate with another repository or a local branch
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
   * Record changes to the repository
   * 
   * @see https://git-scm.com/docs/git-commit
   * 
   * @param path Path to the repository
   * @param message A message that describes the changes
   */
  public async commit(path: string, message: string): Promise<void> {
    const args = ['commit', `--message=${message}`, `--author=${this.options.signature.name} <${this.options.signature.email}>`];
    await this.git(path, args);
  }

  /**
   * Creates a new tag
   * 
   * @see https://git-scm.com/docs/git-tag#Documentation/git-tag.txt---annotate
   * 
   * @param path Path to the repository
   * @param name Name of the new tag
   * @param message Message of the new tag
   * @param commit Optional commit to create the tag on
   */
  public async createTag(path: string, name: string, message: string, commit?: GitCommit): Promise<GitTag> {
    await this.checkBranchOrTagName(path, name);

    let args = ['tag', '--annotate', name];

    if (commit) {
      args = [...args, commit.hash];
    }

    args = [...args, '-m', message];

    await this.git(path, args);
    const tags = await this.listTags(path, name);
    return tags[0];
  }

  /**
   * Gets all local tags or one specific if name is provided
   * 
   * They are sorted by authordate of the commit, not the timestamp the tag is created.
   * This ensures tags are sorted correctly in the timeline of their commits.
   * 
   * @see https://git-scm.com/docs/git-for-each-ref
   * 
   * @param path Path to the repository
   * @param name Optional tag name to resolve
   */
  public async listTags(path: string, name?: string): Promise<GitTag[]> {
    if (name) { await this.checkBranchOrTagName(path, name); }

    const args = ['for-each-ref', '--sort=-*authordate', '--format=%(refname:short)|%(subject)|%(*authorname)|%(*authoremail)|%(*authordate:unix)', 'refs/tags'];
    const result = await this.git(path, args);

    return result.stdout.split('\n').filter((line) => {
      return line !== '';
    }).map((line) => {
      const lineArray = line.split('|');
      return {
        name: lineArray[0],
        message: lineArray[1],
        author: {
          name: lineArray[2],
          email: lineArray[3]
        },
        timestamp: parseInt(lineArray[4])
      };
    }).filter((tag) => {
      if (name) {
        return tag.name === name;
      } else {
        return true;
      }
    });
  }

  /**
   * Deletes a tag
   * 
   * @see https://git-scm.com/docs/git-tag#Documentation/git-tag.txt---delete
   * 
   * @param path Path to the repository
   * @param name Name of the tag to delete
   */
  public async deleteTag(path: string, name: string): Promise<void> {
    await this.checkBranchOrTagName(path, name);
    const args = ['tag', '--delete', name];
    await this.git(path, args);
  }

  /**
   * Gets local commit history
   * 
   * @see https://git-scm.com/docs/git-log
   * 
   * @todo Check if there is a better way to get the commit message without >"< chars
   * @todo Use this method in a service. Decide if we need a HistoryService for example
   * 
   * @param path Path to the repository
   * @param options Options specific to the log operation
   */
  public async log(path: string, options?: Partial<GitLogOptions>): Promise<GitCommit[]> {
    let args = ['log'];

    if (options?.between?.from) {
      args = [...args, `${options.between.from}...${options.between.to || 'HEAD'}`];
    }

    if (options?.limit) {
      args = [...args, `--max-count=${options.limit}`];
    }

    const result = await this.git(path, [...args, '--format=%H|%s|%an|%ae|%at']);

    return result.stdout.split('\n').filter((line) => {
      return line !== '';
    }).map((line) => {
      const lineArray = line.split('|');
      return {
        hash: lineArray[0],
        message: lineArray[1].replace('"', ''),
        author: {
          name: lineArray[2],
          email: lineArray[3]
        },
        timestamp: parseInt(lineArray[4])
      };
    });
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
    const result = await this.git(path, ['log', '--diff-filter=A', '--follow', '--format=%at', '--max-count=1', '--', file]);
    return parseInt(result.stdout);
  }

  /**
   * Returns a timestamp of the files last modification
   * 
   * @param path Path to the repository
   * @param file File to get timestamp from
   */
  public async getFileLastModifiedTimestamp(path: string, file: string) {
    const result = await this.git(path, ['log', '--follow', '--format=%at', '--max-count=1', '--', file]);
    return parseInt(result.stdout);
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
    const userNameArgs = ['config', '--local', 'user.name', this.options.signature.name];
    const userEmailArgs = ['config', '--local', 'user.email', this.options.signature.email];
    await this.git(path, userNameArgs);
    await this.git(path, userEmailArgs);
  }

  /**
   * Wraps the execution of any git command for logging
   * 
   * @param path Path to the repository
   * @param args Arguments to execute under the `git` command
   */
  private async git(path: string, args: string[]): Promise<IGitResult> {
    const result = await GitProcess.exec(args, path);
    if (result.exitCode !== 0) {
      const version = await this.version(path);
      const error = new GitError(`Git (${version}) command "git ${args.join(' ')}" failed with code ${result.exitCode} and message:\n${result.stderr}`);
      const projectId = Util.fromPath.projectId(path);
      if (projectId) {
        this.logService.project(projectId).log.error(error);
      } else {
        this.logService.generic.log.error(error);
      }
    }
    return result;
  }
}