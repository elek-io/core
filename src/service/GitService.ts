import Fs from 'fs-extra';
import Git, { ReadTagResult } from 'isomorphic-git';
import Http from 'isomorphic-git/http/node';
import AbstractService from './AbstractService';
import EventService from './EventService';
import { ElekIoCoreOptions } from '../../type/general';
import Project from '../model/Project';
import Util from '../util';
import { ServiceType } from '../../type/service';

/**
 * Service that manages Git functionality
 */
export default class GitService extends AbstractService {
  private eventService: EventService;

  /**
   * Creates a new instance of the GitService which
   * inherits the type and options properties from AbstractService
   * 
   * @param options ElekIoCoreOptions
   * @param eventService EventService
   */
  constructor(options: ElekIoCoreOptions, eventService: EventService) {
    super(ServiceType.GIT, options);

    this.eventService = eventService;
  }

  /**
   * Initializes given project's folder as a new Git repository
   * 
   * @param project Project to initialize in
   */
  public async init(project: Project): Promise<void> {
    await Git.init({
      fs: Fs,
      dir: Util.pathTo.project(project.id)
    });
  }

  /**
   * Clones a Git repository into destination
   * 
   * @param repository URL to the repository to clone
   * @param destination Folder to clone into
   */
  public async clone(repository: string, destination: string, options?: Partial<Parameters<typeof Git.clone>[0]>): Promise<void> {
    await Git.clone(Util.assignDefaultIfMissing(options, {
      fs: Fs,
      http: Http,
      url: repository,
      dir: destination
    }));
  }

  /**
   * Fetches and merges commits from a remote repository
   * 
   * @param directory Path to the local directory of the repository to pull
   */
  public async pull(directory: string): Promise<void> {
    await Git.pull({
      fs: Fs,
      http: Http,
      dir: directory
    });
  }

  /**
   * Checkout a branch or tag
   * 
   * If the branch / tag already exists it will check out that branch / tag. 
   * Otherwise, it will create it locally and check it out after that.
   * 
   * @todo Maybe without the isNew arg and checking if the branch exists
   * 
   * @param project Project to checkout from
   * @param id Unique name of the branch (e.g. "stage") / UUID if checking out a tag
   * @param isNew If true, a new branch will 
   * @param options Optional git checkout options
   */
  public async checkout(project: Project, id: string, isNew = false, options?: Partial<Parameters<typeof Git.checkout>[0]>): Promise<void> {
    if (isNew === true) {
      await Git.branch({
        fs: Fs,
        dir: Util.pathTo.project(project.id),
        ref: id
      });
    }
    await Git.checkout(Util.assignDefaultIfMissing(options, {
      fs: Fs,
      dir: Util.pathTo.project(project.id),
      ref: id
    }));
  }

  /**
   * Adds given files of the project to it's staging area
   * and commits them
   * 
   * @param project Project to commit files from
   * @param files The files of the project to commit
   * @param message A message that describes the changes
   */
  public async commit(project: Project, files: string[], message: string): Promise<void> {
    const dir = Util.pathTo.project(project.id);
    // Check if given file paths include the project path
    // If so, remove the project path since isomorphic-git
    // cannot resolve absolute file paths
    files = files.map((path) => {
      return this.toRelativePath(dir, path);
    });
    const statusMatrix = await Git.statusMatrix({
      fs: Fs,
      dir,
      filepaths: files
    });
    await Promise.all(statusMatrix.map(([filepath, headStatus, worktreeStatus, stageStatus]) => {
      if (worktreeStatus === 2) {
        return Git.add({
          fs: Fs,
          dir,
          filepath
        });
      } else if(worktreeStatus === 0) {
        return Git.remove({
          fs: Fs,
          dir,
          filepath
        });
      }
    }));
    await Git.commit({
      fs: Fs,
      dir,
      author: {
        name: this.options.signature.name,
        email: this.options.signature.email
      },
      committer: {
        name: this.options.signature.name,
        email: this.options.signature.email
      },
      message
    });
  }

  /**
   * Creates a new tag
   * 
   * @param project Project to create the new tag in
   * @param id UUID of the new tag. Internally used for the ref
   * @param name Name of the new tag. Internally used for the message
   * @param signature A signature which identifies the user who created the tag
   */
  public async createTag(project: Project, id: string, name: string): Promise<ReadTagResult> {
    await Git.annotatedTag({
      fs: Fs,
      dir: Util.pathTo.project(project.id),
      ref: id,
      message: name,
      tagger: {
        name: this.options.signature.name,
        email: this.options.signature.email
      }
    });
    return await this.loadTag(project, id);
  }

  /**
   * Returns a tag by ID
   * 
   * @param project Project to load the tag from
   * @param id UUID of the tag to load
   */
  public async loadTag(project: Project, id: string): Promise<ReadTagResult> {
    const dir = Util.pathTo.project(project.id);
    // Resolve the oid by the tag's reference (in our case a UUID)
    const tagObjectId = await Git.resolveRef({
      fs: Fs,
      dir,
      ref: id
    });
    // Use this oid to get the tag's full information
    const tag = await Git.readTag({
      fs: Fs,
      dir,
      oid: tagObjectId
    });
    return tag;
  }

  /**
   * Returns all available tags of given project
   * 
   * @param project Project to list all tags from
   */
  public async listTags(project: Project): Promise<ReadTagResult[]> {
    const tagIds = await Git.listTags({
      fs: Fs,
      dir: Util.pathTo.project(project.id)
    });
    return await Promise.all(tagIds.map((id) => {
      return this.loadTag(project, id);
    }));
  }

  /**
   * Deletes a tag by ID
   * 
   * @param project Project to delete the tag from
   * @param id UUID of the tag to delete
   */
  public async deleteTag(project: Project, id: string): Promise<void> {
    await Git.deleteTag({
      fs: Fs,
      dir: Util.pathTo.project(project.id),
      ref: id
    });
  }

  /**
   * Removes given dir from absolutePath to make it relative
   * 
   * @param dir Absolute path to the directory which will be removed from absolutePath
   * @param absolutePath A possible absolute path that should be altered
   */
  private toRelativePath(dir: string, absolutePath: string) {
    if (absolutePath.includes(`${dir}/`) === true) {
      return absolutePath.replace(`${dir}/`, '');
    }
    return absolutePath;
  }
}