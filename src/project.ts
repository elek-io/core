import Fs from 'fs-extra';
import Path from 'path';
import ProjectFile from './file/projectFile';
import * as Util from './util/general';
import * as Git from './util/git';
import Theme from './theme';
import Page, { PageFileContent } from './page';
import Block, { BlockFileHeader } from './block';
import Snapshot from './snapshot';
import Asset from './asset';
import { AssetFileConfig } from './file/assetFile';
import Base from './base';
import ProjectLogger from './logger/projectLogger';
import ProjectItemFactory from './projectItemFactory';
import { ProjectItemTypeAsString } from './projectItem';

export class ProjectFileContent {
  public name = '';
  public description= '';
  public version= '1.0.0';
  public status= '';
}

export default class Project extends Base {
  private _logger: ProjectLogger | null = null;
  private _file: ProjectFile | null = null;
  private _config: ProjectFileContent | null = null;
  private _theme: Theme | null = null;
  private _pages: Page[] = [];
  private _blocks: Block[] = [];
  private _snapshots: Snapshot[] = [];
  private _assets: Asset[] = [];
  private _itemFactory: ProjectItemFactory | null = null;

  public get logger(): ProjectLogger {
    return this.checkInitialization(this._logger);
  }

  private get file(): ProjectFile {
    return this.checkInitialization(this._file);
  }

  public get config(): ProjectFileContent {
    return this.checkInitialization(this._config);
  }

  public set config(value: ProjectFileContent) {
    this._config = value;
  }

  public get theme(): Theme {
    return this.checkInitialization(this._theme);
  }

  public get pages(): Page[] {
    return this._pages;
  }

  /**
   * A list of all blocks this project has available,
   * including blocks that are not assigned to a page yet
   */
  public get blocks(): Block[] {
    return this._blocks;
  }

  public get snapshots(): Snapshot[] {
    return this._snapshots;
  }

  public get assets(): Asset[] {
    return this._assets;
  }

  protected get itemFactory(): ProjectItemFactory {
    return this.checkInitialization(this._itemFactory);
  }

  /**
   * Creates a new project on disk
   */
  public async create(name: string, signature: Git.GitSignature): Promise<Project> {
    this.checkReinitialization();

    this._id = Util.uuid();
    this._logger = new ProjectLogger(this.id);
    this._file = new ProjectFile(this._id, this._logger);
    this._itemFactory = new ProjectItemFactory(this);

    // Initialize the Git repository
    await Git.init(Util.pathTo.project(this._id));

    // Create the folder structure, root .gitignore and config file
    await this.createFolderStructure();
    await this.createGitignore();
    await this.createConfig(name);

    // Download default theme
    this._theme = await new Theme(this).use('https://github.com/elek-io/starter-theme.git');

    // Create an initial commit
    await Git.commit(Util.pathTo.project(this._id), signature, '*', ':tada: Created this new elek.io project');

    // Now create and switch to the "stage" branch
    await Git.checkout(Util.pathTo.project(this._id), 'stage', true);

    // Create the first block of content
    const block = await this.block.create(signature, 'en-US', {}, `We are very happy to have you on board. This page was created for you. 
You can use it as a starting point or delete it. If you need help, consider visiting one of these pages: 

- [An introduction to the elek.io client](https://elek.io)
- [Working with pages](https://elek.io)
- [Choosing a theme](https://elek.io)
- [Deploying yout first project](https://elek.io)
`);

    // Create a first page with a reference to the content block
    await this.page.create(signature, 'en-US', {
      name: 'Welcome to elek.io!',
      path: '/',
      stage: 'published',
      layoutId: 'homepage',
      content: [{
        positionId: 'welcome-message',
        blockId: block.id
      }]
    });

    // Load the config file
    this._config = await this._file.load();

    return this;
  }

  /**
   * Loads a project by it's ID
   */
  public async load(id: string): Promise<Project> {
    this.checkReinitialization();

    this._id = id;
    this._logger = new ProjectLogger(this.id);
    this._file = new ProjectFile(this._id, this._logger);
    this._config = await this._file.load();
    this._itemFactory = new ProjectItemFactory(this);

    // Load it's theme, pages and blocks
    await this.refresh();

    return this;
  }

  /**
   * Deletes this project from disk
   */
  public async delete(): Promise<void> {
    await Fs.remove(Util.pathTo.project(this.id));
  }

  /**
   * Saves the project's files on disk and creates a commit
   */
  public async save(signature: Git.GitSignature, message = ':wrench: Updated project config'): Promise<void> {
    // Save each block
    for (let index = 0; index < this.blocks.length; index++) {
      const block = this.blocks[index];
      await block.save(signature);
    }
    // Save each page
    for (let index = 0; index < this.pages.length; index++) {
      const page = this.pages[index];
      await page.save(signature);
    }
    // Save each asset
    for (let index = 0; index < this.assets.length; index++) {
      const asset = this.assets[index];
      await asset.save(signature);
    }
    // Write config to disk
    await this.file.save(this.config);
    await Git.commit(Util.pathTo.project(this.id), signature, this.file.path, message);
  }

  /**
   * Returns the status of all files inside the project
   */
  public async status() {
    return await Git.status(Util.pathTo.project(this.id), '*');
  }

  /**
   * Helper methods for working with pages
   */
  public page = {
    create: async (signature: Git.GitSignature, language: string, partialPageFileContent?: Partial<PageFileContent>): Promise<Page> => {
      return await new Page(this).create(signature, language, partialPageFileContent);
    }
  };

  /**
   * Helper methods for working with blocks
   */
  public block = {
    create: async (signature: Git.GitSignature, language: string, partialBlockFileHeader?: Partial<BlockFileHeader>, content?: string): Promise<Block> => {
      return await new Block(this).create(signature, language, partialBlockFileHeader, content);
    }
  };

  /**
   * Helper methods for working with snapshots
   */
  public snapshot = {
    create: async (signature: Git.GitSignature, name: string, target?: string): Promise<Snapshot> => {
      return await new Snapshot(this).create(signature, name, target);
    }
  };

  /**
   * Helper methods for working with assets
   */
  public asset = {
    create: async (signature: Git.GitSignature, language: string, partialAssetFileContent?: Partial<AssetFileConfig>): Promise<Asset> => {
      return await new Asset(this).create(signature, language, partialAssetFileContent);
    }
  };
  
  /**
   * Returns an JSON object containing relevant information about this project,
   * which can be consumed by themes and plugins
   */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public async export() {
    return {
      ...this.config,
      pages: await Promise.all(this.pages.filter(() => {
        // return page.config.stage === 'published';
        return true;
      }).map(async (page) => {
        return page.export();
      })),
      theme: await this.theme.export()
    };
  }

  /**
   * Builds the project by hydrating the theme with this projects information 
   * and saving the outcome to the projects "public" directory
   * 
   * @todo check how to prevent remote code execution here, since running a user defined command is generally a very bad idea...
   */
  public async build(): Promise<string> {
    let buildLog = '';

    // Export the projects data to the export file, defined by the theme
    await Fs.writeFile(Path.join(Util.pathTo.theme(this.id), this.theme.config.exportFile), JSON.stringify(await this.export(), null, 2));
    
    // Install the themes dependencies
    buildLog += await Util.spawnChildProcess('npm', ['install'], {
      cwd: Path.join(Util.pathTo.theme(this.id))
    });

    // Run the build script which uses the exported json
    // to hydrate the themes content
    buildLog += await Util.spawnChildProcess('npm', ['run', 'build'], {
      cwd: Path.join(Util.pathTo.theme(this.id))
    });

    // Copy the contents of themes "buildDir" to the projects public directory
    // where it's available from outside
    await Fs.emptyDir(Util.pathTo.public(this.id));
    await Fs.copy(Path.join(Util.pathTo.theme(this.id), this.theme.config.buildDir), Util.pathTo.public(this.id));

    return buildLog;
  }

  /**
   * Loads all project item objects like pages and blocks from disk 
   * into the corresponding projects property
   */
  public async refresh(): Promise<void> {
    this._blocks = [];
    this._pages = [];
    this._snapshots = [];
    this._assets = [];
    this._theme = await new Theme(this).load();

    const itemMapping: {
      folder: string,
      extension: string,
      type: ProjectItemTypeAsString
    }[] = [
      {folder: 'blocks', extension: '.md', type: 'block'},
      {folder: 'pages', extension: '.json', type: 'page'},
      {folder: 'assets', extension: '.json', type: 'asset'}
    ];

    // Load all available items except the theme and snapshots
    itemMapping.forEach(async (item) => {
      await Util.returnResolved((await this.allFilesFromFolder(item.folder, item.extension)).map(async (file) => {
        const fileNameArray = file.name.split('.');
        const itemInstance = this.itemFactory.create(item.type);
        return await itemInstance.load(fileNameArray[0], fileNameArray[1]);
      }));
    });

    // Load all available snapshots
    const tagResultList = await Git.tag.list(Util.pathTo.project(this.id));
    Promise.all(tagResultList.map((tagResult) => {
      return new Snapshot(this).load(tagResult.tag.tag);
    }));
  }

  /**
   * Returns a list of files from given folder inside this project.
   * Can be filtered by extension.
   */
  private async allFilesFromFolder(folder: string, extension: string) {
    return await Util.files(Path.join(Util.pathTo.project(this.id), folder), extension);
  }

  /**
   * Writes the projects main .gitignore file to disk
   */
  private async createGitignore(): Promise<void> {
    const content = `.DS_Store
theme/
public/

# Keep directories with .gitkeep files in them
# even if the directory itself is ignored
!/**/.gitkeep`;
    await Fs.writeFile(Path.join(Util.pathTo.project(this.id), '.gitignore'), content);
  }

  /**
   * Creates the projects initial config and writes it to disk
   */
  private async createConfig(name: string): Promise<void> {
    const config = new ProjectFileContent();
    config.name = name;
    await this.file.save(config);
  }

  /**
   * Creates the projects folder structure and makes sure to 
   * write empty .gitkeep files inside them to ensure they are 
   * committed
   */
  private async createFolderStructure(): Promise<void> {
    const folders = [
      'theme',
      'assets',
      'pages',
      'blocks',
      'public',
      'logs'
    ];

    await Promise.all(folders.map(async (folder) => {
      await Fs.mkdirp(Path.join(Util.pathTo.project(this.id), folder));
      await Fs.writeFile(Path.join(Util.pathTo.project(this.id), folder, '.gitkeep'), '');
    }));
  }
}