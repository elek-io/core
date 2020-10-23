// import Fs from 'fs-extra';
// import Path from 'path';
import * as Util from './util/general';
import Project from './project';
import * as Git from './util/git';
import ProjectItem from './projectItem';

/**
 * References a point in time of given project
 * 
 * Internally handled by git via tags
 */
export default class Snapshot extends ProjectItem {
  private _name: string | null = null;
  private _signature: Git.GitSignature | null = null;
  private _timestamp: number | null = null;
  private _timezoneOffset: number | null = null;

  public get name(): string {
    return this.checkInitialization(this._name);
  }

  public get signature(): Git.GitSignature {
    return this.checkInitialization(this._signature);
  }

  public get timestamp(): number {
    return this.checkInitialization(this._timestamp);
  }

  public get timezoneOffset(): number {
    return this.checkInitialization(this._timezoneOffset);
  }

  constructor(project: Project) {
    super(project, 'snapshot');
  }

  /**
   * Creates a new snapshot of given project
   */
  public async create(signature: Git.GitSignature, name: string, target?: string): Promise<Snapshot> {
    this.checkReinitialization();

    this._id = Util.uuid();
    this._signature = signature;
    this._name = name;

    // Create the tag
    const tag = await Git.tag.create(Util.pathTo.project(this.project.id), this.signature, this.id, this.name, {
      object: target
    });

    // Timestamp and timezone offset are created by the tag itself
    this._timestamp = tag.tag.tagger.timestamp;
    this._timezoneOffset = tag.tag.tagger.timezoneOffset;

    // Push the now created snapshot to the project
    this.addToProject();

    return this;
  }

  public async load(id: string): Promise<Snapshot> {
    this.checkReinitialization();

    // Get the tag by ID
    const tag = await Git.tag.load(Util.pathTo.project(this.project.id), id);

    this._id = id;
    this._signature = {
      name: tag.tag.tagger.name,
      email: tag.tag.tagger.email
    };
    this._name = tag.tag.message; // Name of the snapshot is internally handled as the tag's message
    this._timestamp = tag.tag.tagger.timestamp;
    this._timezoneOffset = tag.tag.tagger.timezoneOffset;

    this.addToProject();

    return this;
  }

  /**
   * Reverts the projects state back to when this snapshot was created
   */
  public async revert(signature: Git.GitSignature, force = false): Promise<void> {
    // Checkout the git tag of this snapshot without updating the HEAD
    // This way only the working directory changes
    await Git.checkout(Util.pathTo.project(this.project.id), this.id, false, {
      noUpdateHead: true,
      force
    });
    // Now commit the changes, which are interestingly already added
    await Git.commit(Util.pathTo.project(this.project.id), signature, [], `:rewind: Reverted to snapshot "${this.name}"`);
    // Because the files on disk have probably changed now,
    // we need to refresh all objects in memory by reloading them
    await this.project.refresh();
  }

  public async delete(): Promise<void> {
    // And delete the git tag
    await Git.tag.delete(Util.pathTo.project(this.project.id), this.id);
    // Remove it from the project
    this.removeFromProject();
  }
}