// import Fs from 'fs-extra';
// import Path from 'path';
import Util from './util';
import Project from './project';
import { GitSignature } from './util/git';

/**
 * References a point in time of given project
 * 
 * Internally handled by git via tags
 */
export default class Snapshot {
  // Using definite assignment assertion here
  // because values are assigned by the create and load methods
  private _id!: string;
  private _project: Project;
  private _name!: string;
  private _signature!: GitSignature;
  private _timestamp!: number;
  private _timezoneOffset!: number;

  public get id(): string {
    return this._id;
  }

  public get project(): Project {
    return this._project;
  }

  public get name(): string {
    return this._name;
  }

  public get signature(): GitSignature {
    return this._signature;
  }

  public get timestamp(): number {
    return this._timestamp;
  }

  public get timezoneOffset(): number {
    return this._timezoneOffset;
  }

  constructor(project: Project) {
    this._project = project;
  }

  /**
   * Creates a new snapshot of given project
   */
  public async create(signature: GitSignature, name: string, target?: string): Promise<Snapshot> {
    this._id = Util.uuid();
    this._signature = signature;
    this._name = name;

    // Create the tag
    const tag = await Util.git.tag.create(Util.pathTo.project(this._project.id), this.signature, this.id, this.name, {
      object: target
    });

    // Timestamp and timezone offset are created by the tag itself
    this._timestamp = tag.tag.tagger.timestamp;
    this._timezoneOffset = tag.tag.tagger.timezoneOffset;

    // Push the now created snapshot to the project
    this.project.snapshots.push(this);

    return this;
  }

  public async load(id: string): Promise<Snapshot> {
    // Do not allow reloading an already initialized snapshot
    if (this.id) { throw new Error('A snapshot cannot be reloaded. Please delete the old and then initialize a new one instead.'); }

    // Get the tag by ID
    const tag = await Util.git.tag.load(Util.pathTo.project(this._project.id), id);

    this._id = id;
    this._signature = {
      name: tag.tag.tagger.name,
      email: tag.tag.tagger.email
    };
    this._name = tag.tag.message; // Name of the snapshot is internally handled as the tag's message
    this._timestamp = tag.tag.tagger.timestamp;
    this._timezoneOffset = tag.tag.tagger.timezoneOffset;

    // Push the snapshot to the project if it's not already there
    if (!this.project.snapshots.find((snapshot) => {
      return snapshot.id === this.id;
    })) {
      this.project.snapshots.push(this);
    }

    return this;
  }

  /**
   * Reverts the projects state back to when this snapshot was created
   */
  public async revert(signature: GitSignature, force = false): Promise<void> {
    // Checkout the git tag of this snapshot without updating the HEAD
    // This way only the working directory changes
    await Util.git.checkout(Util.pathTo.project(this._project.id), this.id, false, {
      noUpdateHead: true,
      force
    });
    // Now commit the changes, which are interestingly already added
    await Util.git.commit(Util.pathTo.project(this._project.id), signature, [], `:rewind: Reverted to snapshot "${this.name}"`);
    // Because the files on disk have probably changed now,
    // we need to refresh all objects in memory by reloading them
    await this.project.refresh();
  }

  public async delete(): Promise<void> {
    // Remove it from the project
    const snapshotIndex = this.project.snapshots.findIndex((snapshot) => {
      return snapshot.id === this.id;
    });
    if (snapshotIndex === -1) {
      throw new Error('Tried removing non existing snapshot from the project');
    }
    this.project.snapshots.splice(snapshotIndex, 1);
    // And delete the git tag
    await Util.git.tag.delete(Util.pathTo.project(this._project.id), this.id);
  }
}