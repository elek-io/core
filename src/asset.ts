import AssetFile, { AssetFileConfig } from './file/assetFile';
import Util from './util';
import Project from './project';
import ProjectChild from './projectChild';
import { GitSignature } from './util/git';

export default class Asset extends ProjectChild {
  private _file: AssetFile | null = null;
  private _config: AssetFileConfig | null = null;
  private _content: string | null = null;

  public get language(): string {
    return this.checkInitialization(this._language);
  }

  private get file(): AssetFile {
    return this.checkInitialization(this._file);
  }

  public get config(): AssetFileConfig {
    return this.checkInitialization(this._config);
  }

  public get content(): string {
    return this.checkInitialization(this._content);
  }

  public set content(value: string) {
    this._content = value;
  }

  constructor(project: Project) {
    super(project, 'asset');
  }

  /**
   * Creates a new asset on disk
   */
  public async create(signature: GitSignature, language: string, partialAssetFileConfig?: Partial<AssetFileConfig>, content?: string): Promise<Asset> {
    this.checkReinitialization();
    
    this._id = Util.uuid();
    this._language = language;
    this._file = new AssetFile(this.project.id, this.id, this.language, this.project.logger);

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
    this.addToProject();

    return this;
  }

  /**
   * Loads a asset by it's ID and language
   */
  public async load(id: string, language: string): Promise<Asset> {
    this.checkReinitialization();

    this._id = id;
    this._language = language;
    this._file = new AssetFile(this.project.id, this.id, this.language, this.project.logger);

    const assetFileContent = await this._file.load();

    this._content = assetFileContent.data;
    delete assetFileContent.data;
    this._config = assetFileContent as AssetFileConfig;

    this.addToProject();

    return this;
  }

  /**
   * Saves the asset's files on disk and creates a commit
   */
  public async save(signature: GitSignature, message = ':wrench: Updated asset'): Promise<void> {
    // Write config to disk
    await this.file.save({
      ...this.config,
      data: this.content
    });
    // Commit changes
    await Util.git.commit(Util.pathTo.project(this.project.id), signature, this.file.path, message);
  }

  /**
   * Deletes the asset's files from disk, creates a commit and removes it's reference from the project
   */
  public async delete(signature: GitSignature, message = ':fire: Deleted asset'): Promise<void> {
    // Remove config from disk
    await this.file.delete();
    // Commit changes
    await Util.git.commit(Util.pathTo.project(this.project.id), signature, this.file.path, message);
    // Remove it from the project
    this.removeFromProject();
  }

  public async export(): Promise<{
    id: string;
    name: string;
    description: string;
    language: string;
  }> {
    return {
      id: this.id,
      name: this.config.name,
      description: this.config.description,
      language: this.language
    };
  }
}