import Fs from 'fs';
import Path from 'path';
import * as Util from './util';
import Theme from './theme';
import { Repository, Signature } from 'nodegit';

export class ProjectConfig {
  public name = '';
  public description= '';
  public version= '1.0.0';
  public status= '';
}

export default class Project {
  // Using definite assignment assertion here
  // because values are assigned by the create and load methods
  private _id!: string;
  private _path!: string;
  private _config!: ProjectConfig;
  private _localRepository!: Repository;
  private _theme!: Theme;

  public get id(): string {
    return this._id;
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

  public set config(value: ProjectConfig) {
    this._config = value;
  }

  public get localRepository(): Repository {
    return this._localRepository;
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

    // Initialize the Git repository
    this._localRepository = await Util.git.init(this.path);

    // Create the folder structure, root .gitignore and config file
    await this.createFolderStructure();
    await this.createGitignore();
    await this.createConfig(name);

    // Download default theme
    this._theme = await new Theme(this).use('https://github.com/elek-io/starter-theme.git');

    // Create an initial commit
    await Util.git.commit(this.localRepository, signature, '*', `:tada: Created new elek.io project "${name}"`, true);

    // Now create and switch to the "stage" branch
    await Util.git.checkout(this.localRepository, 'stage', true);

    // @todo: Create the "Hello World!" page

    // Load the config file
    this._config = Util.config.read.project(this.id);

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
    this._localRepository = await Util.git.open(this.path);
    this._config = Util.config.read.project(this.id);

    // Load it's theme
    this._theme = await new Theme(this).load();
    
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
    await Util.git.commit(this.localRepository, signature, '*', message);
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

  private async createConfig(name: string): Promise<void> {
    const content = new ProjectConfig();
    content.name = name;
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