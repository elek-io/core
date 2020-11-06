import Fs from 'fs-extra';
import Path from 'path';
import AssetFile, { AssetFileContent } from './file/assetFile';
import Util from './util';
import Project from './project';
import ProjectItem from './projectItem';
import { GitSignature } from './util/git';

export default class Asset extends ProjectItem {
  private _file: AssetFile | null = null;
  private _config: AssetFileContent | null = null;

  public get language(): string {
    return this.checkInitialization(this._language);
  }

  private get file(): AssetFile {
    return this.checkInitialization(this._file);
  }

  public get config(): AssetFileContent {
    return this.checkInitialization(this._config);
  }

  constructor(project: Project) {
    super(project, 'asset');
  }

  /**
   * Creates a new asset on disk
   */
  public async create(signature: GitSignature, language: string, filePath: string, partialAssetFileContent: Optional<AssetFileContent, 'description' | 'path'>): Promise<Asset> {
    this.checkReinitialization();
    
    this._id = Util.uuid();
    this._language = language;
    this._file = new AssetFile(this.project.id, this.id, this.language, this.project.logger);

    // The asset file will be initialized with a default that can be overwritten
    this._config = Util.assignDefaultIfMissing(partialAssetFileContent, new AssetFileContent());

    // Copy the new file to our LFS store and
    // alter the config to reflect it's new path
    this._config.path = await this.copyFileToLfs(filePath);

    // Create the asset file
    await this._file.save(this._config);

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

    this._config = await this._file.load();

    this.addToProject();

    return this;
  }

  /**
   * Saves the asset's files on disk and creates a commit
   */
  public async save(signature: GitSignature, message = ':wrench: Updated asset'): Promise<void> {
    // Write config to disk
    await this.file.save(this.config);
    // Commit changes
    await Util.git.commit(Util.pathTo.project(this.project.id), signature, this.file.path, message);
  }

  /**
   * Deletes the asset's files from disk, creates a commit and removes it's reference from the project
   */
  public async delete(signature: GitSignature, message = ':fire: Deleted asset'): Promise<void> {
    // Remove actual asset from LFS
    await Fs.remove(Path.join(Util.workingDirectory, this.config.path));
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

  /**
   * Copies given file to the projects LFS
   * and returns it's new relative path
   */
  private async copyFileToLfs(filePath: string) {
    const destination = Path.join(Util.pathTo.lfs(this.project.id), `${Util.uuid()}${Path.extname(filePath)}`);
    const relativePath = Util.getRelativePath(destination);
    await Fs.copyFile(filePath, destination);
    return relativePath;
  }
}