import Fs from 'fs-extra';
import Path from 'path';
import Util from './util';
import { GitSignature } from './util/git';
import Theme from './theme';
import Page, { PageConfig } from './page';
import Block, { BlockConfig } from './block';
import Snapshot from './snapshot';

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
  private _theme!: Theme;
  private _pages: Page[] = [];
  private _blocks: Block[] = [];
  private _snapshots: Snapshot[] = [];

  public get id(): string {
    return this._id;
  }

  public get path(): string {
    return this._path;
  }

  public get config(): ProjectConfig {
    return this._config;
  }

  public set config(value: ProjectConfig) {
    this._config = value;
  }

  public get theme(): Theme {
    return this._theme;
  }

  public get pages(): Page[] {
    return this._pages;
  }

  /**
   * Returning a list of all blocks this project has available,
   * including blocks that are not assigned to a page yet
   */
  public get blocks(): Block[] {
    return this._blocks;
  }

  public get snapshots(): Snapshot[] {
    return this._snapshots;
  }

  /**
   * Creates a new project on disk
   */
  public async create(name: string, signature: GitSignature): Promise<Project> {
    this._id = Util.uuid();
    this._path = Path.join(Util.pathTo.projects, this.id);

    // Initialize the Git repository
    await Util.git.init(this.path);

    // Create the folder structure, root .gitignore and config file
    await this.createFolderStructure();
    await this.createGitignore();
    await this.createConfig(name);

    // Download default theme
    this._theme = await new Theme(this).use('https://github.com/elek-io/starter-theme.git');

    // Create an initial commit
    await Util.git.commit(this.path, signature, '*', ':tada: Created this new elek.io project');

    // Now create and switch to the "stage" branch
    await Util.git.checkout(this.path, 'stage', true);

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
    this._config = await Util.read.project(this.id);

    return this;
  }

  /**
   * Loads a project by it's ID
   */
  public async load(id: string): Promise<Project> {
    // Do not allow reloading an already initialized project
    if (this.id) { throw new Error('A project cannot be reloaded. Please delete the old and then initialize a new one instead.'); }

    this._id = id;
    this._path = Path.join(Util.pathTo.projects, this.id);
    this._config = await Util.read.project(this.id);

    // Load it's theme
    this._theme = await new Theme(this).load();

    // Load it's pages and blocks
    await this.refresh();
    
    return this;
  }

  /**
   * Deletes this project from disk
   */
  public async delete(): Promise<void> {
    // Only if an ID is present
    if (!this.id) { throw new Error('Project cannot be deleted because it was never created nor loaded.'); }

    await Fs.remove(this.path);
  }

  /**
   * Saves the project's files on disk and creates a commit
   */
  public async save(signature: GitSignature, message = ':wrench: Updated project config'): Promise<void> {
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
    // Write config to disk
    await Util.write.project(this.id, this.config);
    await Util.git.commit(this.path, signature, Util.configNameOf.project, message);
  }

  /**
   * Helper methods for working with pages
   */
  public page = {
    create: async (signature: GitSignature, language: string, partialConfig?: Partial<PageConfig>): Promise<Page> => {
      return await new Page(this).create(signature, language, partialConfig);
    }
  };

  /**
   * Helper methods for working with blocks
   */
  public block = {
    create: async (signature: GitSignature, language: string, partialConfig?: Partial<BlockConfig>, content?: string): Promise<Block> => {
      return await new Block(this).create(signature, language, partialConfig, content);
    }
  };

  /**
   * Helper methods for working with snapshots
   */
  public snapshot = {
    create: async (signature: GitSignature, name: string, target?: string): Promise<Snapshot> => {
      return await new Snapshot(this).create(signature, name, target);
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
    await Util.json.write(Path.join(this.path, 'theme', this.theme.config.exportFile), await this.export());
    
    // Install the themes dependencies
    buildLog += await Util.spawnChildProcess('npm', ['install'], {
      cwd: Path.join(this.path, 'theme')
    });

    // Run the build script which uses the exported json
    // to hydrate the themes content
    buildLog += await Util.spawnChildProcess('npm', ['run', 'build'], {
      cwd: Path.join(this.path, 'theme')
    });

    // Copy the contents of themes "buildDir" to the projects public directory
    // where it's available from outside
    await Fs.emptyDir(Path.join(this.path, 'public'));
    await Fs.copy(Path.join(this.path, 'theme', this.theme.config.buildDir), Path.join(this.path, 'public'));

    return buildLog;
  }

  /**
   * Loads all child objects like pages and blocks from disk 
   * into the corresponding projects property
   */
  public async refresh(): Promise<void> {
    this._blocks = [];
    this._pages = [];
    this._snapshots = [];
    this._theme = await this.theme.load();

    const objects = [
      {
        name: 'blocks',
        extension: '.md'
      },
      {
        name: 'pages',
        extension: '.json'
      }
    ];

    // Get all files from the pages and blocks folder that have the appropriate extension
    const possibleObjects = await Promise.all([
      await Util.files(Path.join(this.path, objects[0].name), objects[0].extension),
      await Util.files(Path.join(this.path, objects[1].name), objects[1].extension)
    ]);
    
    // Return all objects we are able to resolve without throwing errors
    await Util.returnResolved(possibleObjects[0].map((possibleBlock) => {
      const fileNameArray = possibleBlock.name.replace(objects[0].extension, '').split('.');
      return new Block(this).load(fileNameArray[0], fileNameArray[1]);
    }));

    await Util.returnResolved(possibleObjects[1].map((possiblePage) => {
      const fileNameArray = possiblePage.name.replace(objects[1].extension, '').split('.');
      return new Page(this).load(fileNameArray[0], fileNameArray[1]);
    }));

    // Load all available snapshots
    const tagResultList = await Util.git.tag.list(this.path);
    Promise.all(tagResultList.map((tagResult) => {
      return new Snapshot(this).load(tagResult.tag.tag);
    }));
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
    await Fs.writeFile(Path.join(this.path, '.gitignore'), content);
  }

  /**
   * Creates the projects initial config and writes it to disk
   */
  private async createConfig(name: string): Promise<void> {
    const config = new ProjectConfig();
    config.name = name;
    await Util.write.project(this.id, config);
  }

  /**
   * Creates the projects folder structure and makes sure to 
   * write empty .gitkeep files inside them to ensure they are 
   * committed
   */
  private async createFolderStructure(): Promise<void> {
    const folders = [
      'theme',
      'media',
      'pages',
      'blocks',
      'public'
    ];

    await Promise.all(folders.map(async (folder) => {
      await Fs.mkdir(Path.join(this.path, folder));
      await Fs.writeFile(Path.join(this.path, folder, '.gitkeep'), '');
    }));
  }
}