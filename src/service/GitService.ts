import { GitProcess } from 'dugite';
import AbstractService from './AbstractService';
import EventService from './EventService';
import { ElekIoCoreOptions } from '../../type/general';
import { ServiceType } from '../../type/service';
import { GitCloneOptions, GitInitOptions, GitSwitchOptions, GitTag } from '../../type/git';

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
 * @todo Implement Git response model to handle success and error,
 * since currently it fails silently without throwing
 */
export default class GitService extends AbstractService {
  private eventService: EventService;

  public constructor(options: ElekIoCoreOptions, eventService: EventService) {
    super(ServiceType.GIT, options);

    this.eventService = eventService;
  }

  /**
   * Create an empty Git repository or reinitialize an existing one
   * 
   * @see https://git-scm.com/docs/git-init
   * @todo Change implementation once dugite updated to Git >= 2.28.0
   * 
   * @param path Path to initialize in. Fails if path does not exist
   * @param options Options specific to the init operation
   */
  public async init(path: string, options?: Partial<GitInitOptions>): Promise<void> {
    const args = ['init'];

    // For when dugite is using Git >= 2.28.0
    // if (options?.initialBranch) {
    //   args = [...args, `--initial-branch="${options.initialBranch}"`];
    // }

    await GitProcess.exec(args, path);

    // Delete when dugite is using Git >= 2.28.0
    if (options?.initialBranch) {
      await this.switch(path, options.initialBranch, { isNew: true });
    }
  }

  /**
   * Clone a repository into a directory
   * 
   * @see https://git-scm.com/docs/git-clone
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

    await GitProcess.exec([...args, url, '.'], path);
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

    await GitProcess.exec(args, path);
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
    let args = ['switch'];

    if (options?.isNew === true) {
      args = [...args, '--create', name];
    } else {
      args = [...args, name];
    }

    await GitProcess.exec(args, path);
  }

  /**
   * Restore working tree files
   * 
   * @see https://git-scm.com/docs/git-restore/
   * 
   * @param path Path to the repository
   * @param source Git commit or tag to restore to
   * @param files Files to restore
   */
  public async restore(path: string, source: string, files: string[]): Promise<void> {
    const args = ['restore', `--source=${source}`, ...files];

    await GitProcess.exec(args, path);
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

    await GitProcess.exec(args, path);
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
    const args = ['commit', `--message="${message}"`, `--author="${this.options.signature.name} <${this.options.signature.email}>"`];

    await GitProcess.exec(args, path);
  }

  /**
   * Creates a new tag
   * 
   * @see https://git-scm.com/docs/git-tag#Documentation/git-tag.txt---annotate
   * 
   * @param path Path to the repository
   * @param name Name of the new tag
   * @param message Message of the new tag
   */
  public async createTag(path: string, name: string, message: string): Promise<void> {
    const args = ['tag', '--annotate', '-m', message, name];

    await GitProcess.exec(args, path);
  }

  /**
   * Gets all local tags or one specific if name is provided
   * 
   * @see https://git-scm.com/docs/git-tag#Documentation/git-tag.txt---list
   * 
   * @param path Path to the repository
   * @param name Optional tag name to resolve
   */
  public async listTags(path: string, name?: string): Promise<GitTag[]> {
    const args = ['for-each-ref', '--format=%(refname:short)|%(subject)|%(*authorname)|%(*authoremail)|%(*authordate:unix)', 'refs/tags'];
    const result = await GitProcess.exec(args, path);

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
    const args = ['tag', '--delete', name];

    await GitProcess.exec(args, path);
  }
}