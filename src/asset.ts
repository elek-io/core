import AssetFile, { AssetFileConfig } from './file/assetFile';
import Util from './util';
import { GitSignature } from './util/git';
import Project from './project';

export default class Asset {
  // Using definite assignment assertion here
  // because values are assigned by the create and load methods
  private _id!: string;
  private _language!: string;
  private _project: Project;
  private _file!: AssetFile;
  private _config!: AssetFileConfig;
  private _content!: string;

  public get id(): string {
    return this._id;
  }

  public get language(): string {
    return this._language;
  }

  public get project(): Project {
    return this._project;
  }

  public get config(): AssetFileConfig {
    return this._config;
  }

  public get content(): string {
    return this._content;
  }

  public set content(value: string) {
    this._content = value;
  }

  constructor(project: Project) {
    this._project = project;
  }

  /**
   * Creates a new asset on disk
   */
  public async create(signature: GitSignature, language: string, partialAssetFileConfig?: Partial<AssetFileConfig>, content?: string): Promise<Asset> {
    this._id = Util.uuid();
    this._language = language;
    this._file = new AssetFile(this.project.id, this.id, this.language);

    // The asset file will be initialized with a default that can be overwritten
    this._config = Util.assignDefaultIfMissing(partialAssetFileConfig || {}, new AssetFileConfig());
    this._content = content || '';

    // Create the asset file
    await this._file.save({
      ...this._config,
      data: this._content
    });

    // Create a new commit
    await this.save(signature, ':heavy_plus_sign: Created new asset');

    // Add this asset to the project
    this.project.assets.push(this);

    return this;
  }

  /**
   * Loads a asset by it's ID and language
   */
  public async load(id: string, language: string): Promise<Asset> {
    // Do not allow reloading an already initialized asset
    if (this.id) { throw new Error('A asset cannot be reloaded. Please delete the old and then initialize a new one instead.'); }

    this._id = id;
    this._language = language;
    this._file = new AssetFile(this.project.id, this.id, this.language);

    const assetFileContent = await this._file.load();

    this._content = assetFileContent.data;
    delete assetFileContent.data;
    this._config = assetFileContent as AssetFileConfig;

    // Push the asset to the project if it's not already there
    if (!this.project.assets.find((asset) => {
      return asset.id === this.id && asset.language === this._language;
    })) {
      this.project.assets.push(this);
    }

    return this;
  }

  /**
   * Saves the asset's files on disk and creates a commit
   */
  public async save(signature: GitSignature, message = ':wrench: Updated asset'): Promise<void> {
    // Write config to disk
    await this._file.save({
      ...this._config,
      data: this._content
    });
    // Commit changes
    await Util.git.commit(Util.pathTo.project(this._project.id), signature, this._file.path, message);
  }

  /**
   * Deletes the asset's files from disk, creates a commit and removes it's reference from the project
   */
  public async delete(signature: GitSignature, message = ':fire: Deleted asset'): Promise<void> {
    // Remove config from disk
    await this._file.delete();
    // Commit changes
    await Util.git.commit(Util.pathTo.project(this._project.id), signature, this._file.path, message);
    // Remove it from the project
    const assetIndex = this.project.assets.findIndex((asset) => {
      return asset.id === this.id && asset.language === this._language;
    });
    if (assetIndex === -1) {
      throw new Error('Tried removing an not existing asset from the project');
    }
    this.project.assets.splice(assetIndex, 1);
  }

  public async export(): Promise<{
    id: string;
    name: string;
    description: string;
    language: string;
  }> {
    return {
      id: this.id,
      name: this._config.name,
      description: this._config.description,
      language: this.language
    };
  }
}