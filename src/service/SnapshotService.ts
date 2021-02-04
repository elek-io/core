import { ElekIoCoreOptions } from '../../type/general';
import { GitCommit } from '../../type/git';
import { ModelType } from '../../type/model';
import { CrudService, ServiceType } from '../../type/service';
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
export default class SnapshotService extends AbstractService implements CrudService {
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
  public async create(project: Project, name: string, commit?: GitCommit): Promise<Snapshot> {
    const id = Util.uuid();
    const projectPath = Util.pathTo.project(project.id);
    const tag = await this.gitService.createTag(projectPath, id, name, commit);
    const snapshot = new Snapshot(tag.name, tag.name, tag.timestamp, tag.author);
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
    const tags = await this.gitService.listTags(Util.pathTo.project(project.id), id);
    if (tags.length === 0) {
      throw new Error(`Snapshot "${id}" not found`);
    }
    if (tags.length > 1) {
      throw new Error(`Snapshot "${id}" resolved ${tags.length} git tags`);
    }
    const snapshot = new Snapshot(tags[0].name, tags[0].message, tags[0].timestamp, tags[0].author);
    this.eventService.emit(`${this.type}:read`, {
      project,
      data: {
        snapshot
      }
    });
    return snapshot;
  }

  /**
   * @todo Check if we are able to and actually want to update snapshots
   */
  public async update(): Promise<void> {
    throw new Error('Method not supported');
  }

  /**
   * Returns all available snapshots of given project
   * 
   * @param project Project to list all snapshots from
   */
  public async list(project: Project): Promise<Snapshot[]> {
    const tags = await this.gitService.listTags(Util.pathTo.project(project.id));
    const snapshots: Snapshot[] = [];
    tags.forEach((tag) => {
      snapshots.push(new Snapshot(tag.name, tag.message, tag.timestamp, tag.author));
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
   * @param project Project to revert
   * @param snapshot Snapshot of the project to revert to
   * @param message Optional overwrite for the git message
   */
  public async revert(project: Project, snapshot: Snapshot, message = `Reverted project state to ${this.type}`): Promise<void> {
    const projectPath = Util.pathTo.project(project.id);
    // Restore the working directory files to given snapshot / Git tag
    await this.gitService.restore(projectPath, snapshot.id, ['.']);
    // Commit the now changed files again
    await this.gitService.add(projectPath, ['.']);
    await this.gitService.commit(projectPath, `:rewind: ${message} (ID: ${snapshot.id})`);
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
    await this.gitService.deleteTag(Util.pathTo.project(project.id), snapshot.id);
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