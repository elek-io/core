import Fs from 'fs';
import Path from 'path';
import * as Util from './util';
import Theme from './theme';
import { Repository, Signature } from 'nodegit';

export interface ProjectConfig {
  name: string;
  description: string;
  version: string;
  status: string;
}

export default class Project {
  // Using definite assignment assertion here
  // because values are assigned by the create and load methods
  private _id!: string;
  private _name!: string;
  private _path!: string;
  private _config!: ProjectConfig;
  private _repository!: Repository;
  private _theme!: Theme;

  public get id(): string {
    return this._id;
  }
  
  public get name(): string {
    return this._name;
  }

  public set name(value: string) {
    this._config.name = value;
    this._name = value;
  }

  public get path(): string {
    return this._path;
  }

  public get config(): ProjectConfig {
    // Private property acts like a cache
    if (this._config) {
      return this._config;
    }

    this._config = Util.config.read.project(this.id);
    return this._config;
  }

  public get repository(): Repository {
    return this._repository;
  }

  public get theme(): Theme {
    return this._theme;
  }

  /**
   * Creates a new project on disk
   */
  public async create(name: string, signature: Signature): Promise<Project> {
    this._id = Util.uuid();
    this._path = Path.join(Util.pathTo.projects, this.id);
    this._name = name;

    // Initialize the Git repository
    this._repository = await Util.git.init(this.path);

    // Create the folder structure, root .gitignore and config file
    await this.createFolderStructure();
    await this.createGitignore();
    await this.createConfig();

    // Download default theme
    this._theme = await new Theme(this.id).use('https://github.com/elek-io/starter-theme.git');

    // Create an initial commit
    await Util.git.commit(this.repository, signature, '*', `:tada: Created new elek.io project "${name}"`, true);

    // Now create and switch to the "stage" branch
    await Util.git.checkout(this.repository, 'stage', true);

    // @todo: Create the "Hello World!" page

    return this;
  }

  /**
   * Loads a project by it's ID
   */
  public async load(id: string): Promise<Project> {
    // Do not allow reloading an already initialized project
    if (this.id) { throw new Error('A project cannot be reloaded. Please delete the old and then initialize a new one instead.'); }

    this._id = id;
    this._path = Path.join(Util.pathTo.projects, id);
    this._name = this.config.name;
    this._repository = await Util.git.open(this.path);

    // Load it's theme
    this._theme = await new Theme(this.id).load();
    
    return this;
  }

  /**
   * Deletes this project from disk
   */
  public async delete(): Promise<void> {
    // Only if an ID is present
    if (!this.id) { throw new Error('Project cannot be deleted because it was never created nor loaded.'); }

    await Util.rmrf(this.path);
  }

  /**
   * Saves the project's files on disk and creates a commit
   */
  public async save(signature: Signature, message: string): Promise<void> {
    // Write config to disk
    Util.config.write.project(this.id, this.config);
    // Commit changes
    await Util.git.commit(this.repository, signature, '*', message);
  }

  private async createGitignore(): Promise<void> {
    const content = `.DS_Store
theme/
public/

# Keep directories with .gitkeep files in them
# even if the directory itself is ignored
!/**/.gitkeep`;
    await Fs.promises.writeFile(Path.join(this.path, '.gitignore'), content);
  }

  private async createConfig(): Promise<void> {
    const content: ProjectConfig = {
      name: this.name,
      description: '',
      version: '1.0.0',
      status: ''
    };
    Util.config.write.project(this.id, content);
  }

  private async createFolderStructure(): Promise<void> {
    const folders = [
      'theme',
      'media',
      'pages',
      'blocks',
      'public'
    ];

    await Promise.all(folders.map(async (folder) => {
      await Util.mkdir(Path.join(this.path, folder));
      await Fs.promises.writeFile(Path.join(this.path, folder, '.gitkeep'), '');
    }));
  }
}