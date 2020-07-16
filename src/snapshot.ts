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
  private _message!: string;
  private _signature!: GitSignature;

  public get id(): string {
    return this._id;
  }

  public get project(): Project {
    return this._project;
  }

  public get name(): string {
    return this._name;
  }

  public get message(): string {
    return this._message;
  }

  public get signature(): GitSignature {
    return this._signature;
  }

  constructor(project: Project) {
    this._project = project;
  }

  /**
   * Creates a new snapshot of given project
   */
  public async create(signature: GitSignature, id: string, name: string, message: string): Promise<Snapshot> {
    this._id = id;
    this._signature = signature;
    this._name = name;
    this._message = message;
    await Util.git.tag(this.project.path, this.signature, this.id, this.name, this.message);
    // this.project.snapshots.push(this);
    return this;
  }

  // public async load(id: string): Promise<Snapshot> {

  //   await Util.git.checkout(this.project.path, this.id, false, {force});
  // }

  /**
   * Reverts the projects state back to when this snapshot was created
   * 
   * @todo check how the detached HEAD state affects further commits and merges
   */
  public async revert(force = false): Promise<void> {
    await Util.git.checkout(this.project.path, this.id, false, {force});
  }
}