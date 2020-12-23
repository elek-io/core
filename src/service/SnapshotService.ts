import { ElekIoCoreOptions } from '../../type/general';
import { ModelType } from '../../type/model';
import { ServiceType } from '../../type/service';
import AbstractModel from '../model/AbstractModel';
import Project from '../model/Project';
import Snapshot from '../model/Snapshot';
import Util from '../util';
import AbstractService from './AbstractService';
import EventService from './EventService';
import GitService from './GitService';

/**
 * Service that manages CRUD functionality for snapshots
 */
export default class SnapshotService extends AbstractService {
  private eventService: EventService;
  private gitService: GitService;

  /**
   * Creates a new instance of the SnapshotService which
   * inherits the type and options properties from AbstractService
   * 
   * @param options ElekIoCoreOptions
   * @param eventService EventService
   * @param gitService GitService
   */
  constructor(options: ElekIoCoreOptions, eventService: EventService, gitService: GitService) {
    super(ServiceType.SNAPSHOT, options);

    this.eventService = eventService;
    this.gitService = gitService;
  }

  /**
   * Creates a new snapshot of given project
   * 
   * @param project Project to create the snapshot from
   * @param name Name of the new snapshot
   */
  public async create(project: Project, name: string): Promise<Snapshot> {
    const id = Util.uuid();
    const tag = await this.gitService.createTag(project, id, name);
    const snapshot = new Snapshot(id, tag.tag.message, tag.tag.tagger.timestamp, tag.tag.tagger.timezoneOffset);
    this.eventService.emit(`${this.type}:create`, {
      project,
      data: {
        snapshot
      }
    });
    return snapshot;
  }

  /**
   * Finds and returns a snapshot by ID
   * 
   * @param project Project of the snapshot to read
   * @param id ID of the snapshot to read
   */
  public async read(project: Project, id: string): Promise<Snapshot> {
    const tag = await this.gitService.loadTag(project, id);
    const snapshot = new Snapshot(id, tag.tag.message, tag.tag.tagger.timestamp, tag.tag.tagger.timezoneOffset);
    this.eventService.emit(`${this.type}:read`, {
      project,
      data: {
        snapshot
      }
    });
    return snapshot;
  }

  /**
   * Returns all available snapshots of given project
   * 
   * @param project Project to list all snapshots from
   */
  public async list(project: Project): Promise<Snapshot[]> {
    const tags = await this.gitService.listTags(project);
    const snapshots: Snapshot[] = [];
    tags.forEach((tag) => {
      snapshots.push(new Snapshot(tag.tag.tag, tag.tag.message, tag.tag.tagger.timestamp, tag.tag.tagger.timezoneOffset));
    });
    this.eventService.emit(`${this.type}:list`, {
      project,
      data: {
        snapshots
      }
    });
    return snapshots;
  }

  /**
   * Reverts the projects state back to given snapshot
   * 
   * @todo Since the LFS folder is ignored by git
   * (which is correct since we only want asset references, not the actual files inside git),
   * we need to find a way to restore the LFS folder to the given state of the snapshot too.
   * Until then, assets are broken once we revert to a snapshot
   * 
   * @todo We simply commit everything after an revert. This is a bit dangerous,
   * since it will also commit uncommitted files that have nothing to do with the revert.
   * Maybe we should be more specific here
   * 
   * @param project Project to revert it's state
   * @param snapshot Snapshot to revert to
   * @param force Force the revert even if we loose uncommitted data
   * @param message Optional overwrite for the git message
   */
  public async revert(project: Project, snapshot: Snapshot, force = false, message = `Reverted project state to ${this.type}`): Promise<void> {
    // Checkout the git tag of this snapshot without updating the HEAD
    // This way only the working directory changes
    await this.gitService.checkout(project, snapshot.id, false, {
      noUpdateHead: true,
      force
    });
    // Commit the now changed files again
    await this.gitService.commit(project, ['.'], `:rewind: ${message}`);
    this.eventService.emit(`${this.type}:revert`, {
      project,
      data: {
        snapshot
      }
    });
  }

  /**
   * Deletes given snapshot
   * 
   * @param project Project of the snapshot to delete
   * @param snapshot Snapshot to delete
   */
  public async delete(project: Project, snapshot: Snapshot): Promise<void> {
    await this.gitService.deleteTag(project, snapshot.id);
    this.eventService.emit(`${this.type}:delete`, {
      project,
      data: {
        snapshot
      }
    });
  }

  /**
   * Checks if given model is of type snapshot
   * 
   * @param model The model to check
   */
  public isSnapshot(model: AbstractModel): boolean {
    return model.type === ModelType.SNAPSHOT;
  }
}