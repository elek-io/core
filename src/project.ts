import Fs from 'fs-extra';
import Path from 'path';
import { Repository, Signature } from 'nodegit';
import * as Util from './util';
import Theme from './theme';
import Page, { PageConfig, PageConfigKey } from './page';
import Block, { BlockConfig, BlockConfigKey } from './block';

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
  private _pages: Page[] = [];
  private _blocks: Block[] = [];

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

  public get localRepository(): Repository {
    return this._localRepository;
  }

  public get theme(): Theme {
    return this._theme;
  }

  public get pages(): Page[] {
    return this._pages;
  }

  public get blocks(): Block[] {
    return this._blocks;
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
    await Util.git.commit(this.localRepository, signature, '*', ':tada: Created this new elek.io project', true);

    // Now create and switch to the "stage" branch
    await Util.git.checkout(this.localRepository, 'stage', true);

    // Create the first block of content
    this._blocks.push(await new Block(this).create(signature, {
      language: 'en'
    }, `# Hello World!
Lorem impsum dolor...

- Lorem
- ipsum
- dolor
`));

    // Create a first page with a reference to the content block
    this._pages.push(await new Page(this).create(signature, {
      name: 'My first page',
      slug: Util.slug('My first page'),
      stage: 'wip',
      content: [{
        themeBlockId: 'test-theme-id',
        blockId: this.blocks[0].id
      }]
    }));

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
    this._path = Path.join(Util.pathTo.projects, id);
    this._localRepository = await Util.git.open(this.path);
    this._config = await Util.read.project(this.id);

    // Load it's theme
    this._theme = await new Theme(this).load();

    // Load it's pages
    await this.loadPages();

    // Load it's blocks
    await this.loadBlocks();
    
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
  public async save(signature: Signature, message = ':wrench: Updated project config'): Promise<void> {
    // Write config to disk
    await Util.write.project(this.id, this.config);
    await Util.git.commit(this.localRepository, signature, Path.join(this.path, Util.configNameOf.project), message);
    // Save each block
    this.blocks.forEach(async (block) => {
      await block.save(signature);
    });
    // Save each page
    this.pages.forEach(async (page) => {
      await page.save(signature);
    });
  }

  /**
   * Helper methods for working with pages
   */
  public page = {
    create: async (signature: Signature, config?: PageConfig): Promise<Page> => {
      const page = await new Page(this).create(signature, config);
      this._pages.push(page);
      return page;
    },
    find: async (key: 'id' | PageConfigKey, value: string): Promise<Page | undefined> => {
      return this.pages.find((page: Page) => {
        // Find by ID
        if (key === 'id') {
          return page[key] === value;
        }
        // Find by config key
        return page.config[key] === value;
      });
    }
  };

  /**
   * Helper methods for working with blocks
   */
  public block = {
    create: async (signature: Signature, config: BlockConfig, content?: string): Promise<Block> => {
      const block = await new Block(this).create(signature, config, content);
      this._blocks.push(block);
      return block;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
    find: async (key: 'id' | BlockConfigKey, value: any): Promise<Block | undefined> => {
      return this.blocks.find((block: Block) => {
        // Find by ID
        if (key === 'id') {
          return block[key] === value;
        }
        // Find by config key
        return block.config[key] === value;
      });
    }
  };

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
    await Util.write.project(this.id, content);
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

  private async loadPages(): Promise<void> {
    // Get all files from the pages folder that have an .json extension
    const possiblePages = await Util.files(Path.join(this.path, 'pages'), '.json');
    // Return all pages we are able to resolve without throwing errors
    this._pages = await Util.returnResolved(possiblePages.map((possiblePage) => {
      return new Page(this).load(possiblePage.name.replace('.json', ''));
    }));
  }

  private async loadBlocks(): Promise<void> {
    // Get all files from the blocks folder that have an .json extension
    const possibleBlocks = await Util.files(Path.join(this.path, 'blocks'), '.json');
    // Return all pages we are able to resolve without throwing errors
    this._blocks = await Util.returnResolved(possibleBlocks.map((possibleBlock) => {
      return new Block(this).load(possibleBlock.name.replace('.json', ''));
    }));
  }
}