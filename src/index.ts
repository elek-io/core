import Fs from 'fs-extra';
import Path from 'path';
import Util from './util';
import Project from './model/Project';
import AssetService from './service/AssetService';
import EventService from './service/EventService';
import JsonFileService from './service/JsonFileService';
import MdFileService from './service/MdFileService';
import ProjectService from './service/ProjectService';
import Asset from './model/Asset';
import LogService from './service/LogService';
import PageService from './service/PageService';
import BlockService from './service/BlockService';
import Page from './model/Page';
import { ElekIoCoreOptions, Optional } from '../type/general';
import Block from './model/Block';
import SnapshotService from './service/SnapshotService';
import GitService from './service/GitService';
import Snapshot from './model/Snapshot';
import ThemeService from './service/ThemeService';
import { CrudService } from '../type/service';

/**
 * elek.io core
 * 
 * Provides access to all services from the outside.
 */
export default class ElekIoCore {
  private readonly options: ElekIoCoreOptions;
  private readonly logService: LogService;
  private readonly eventService: EventService;
  private readonly gitService: GitService;
  private readonly snapshotService: SnapshotService;
  private readonly jsonFileService: JsonFileService;
  private readonly mdFileService: MdFileService;
  private readonly themeService: ThemeService;
  private readonly assetService: AssetService;
  private readonly pageService: PageService;
  private readonly blockService: BlockService;
  private readonly projectService: ProjectService;

  constructor(options: Optional<ElekIoCoreOptions, 'theme' | 'file'>) {
    const defaults: Omit<ElekIoCoreOptions, 'signature'> = {
      theme: {
        htmlPrefix: 'elek-io'
      },
      file: {
        md: {
          delimiter: '---'
        }
      }
    };
    this.options = Object.assign({}, defaults, options);

    this.logService = new LogService(this.options);
    this.eventService = new EventService(this.options, this.logService);
    this.gitService = new GitService(this.options, this.logService, this.eventService);
    this.snapshotService = new SnapshotService(this.options, this.eventService, this.gitService);
    this.jsonFileService = new JsonFileService(this.options, this.eventService);
    this.mdFileService = new MdFileService(this.options, this.eventService);
    this.themeService = new ThemeService(this.options, this.eventService, this.jsonFileService, this.gitService);
    this.assetService = new AssetService(this.options, this.eventService, this.jsonFileService, this.gitService);
    this.pageService = new PageService(this.options, this.eventService, this.jsonFileService, this.gitService);
    this.blockService = new BlockService(this.options, this.eventService, this.mdFileService, this.gitService);
    this.projectService = new ProjectService(this.options, this.eventService, this.jsonFileService, this.gitService, this.blockService, this.pageService, this.themeService);
  }

  /**
   * Initializes elek.io core by assuring the basic requirements are met.
   * 
   * Checks if the "NODE_ENV" variable is available, 
   * assures the directory structure is there
   * and empties the tmp directory.
   */
  public async init(): Promise<void> {
    if (!process.env.NODE_ENV) {
      throw new Error('Environment variable "NODE_ENV" is not set');
    }
    if (process.env.NODE_ENV !== 'production') {
      this.logService.generic.log.info(`Initializing inside an "${process.env.NODE_ENV}" environment`);
    }
    await Promise.all([
      Fs.mkdirp(Util.pathTo.logs),
      Fs.mkdirp(Util.pathTo.projects),
      Fs.mkdirp(Util.pathTo.tmp)
    ]);
    await Fs.emptyDir(Util.pathTo.tmp);
  }

  /**
   * Util library
   * 
   * @todo Do we really want to expose this / is this really needed?
   */
  public get util() {
    return Util;
  }

  /**
   * Endpoint to subscribe to internal events and react to accordingly
   * 
   * @todo figure out if we really want outside code be able to call emit()
   */
  public get event() {
    return {
      on: this.eventService.on,
      emit: this.eventService.emit
    };
  }

  /**
   * Searches for projects on disk, loads and returns them
   */
  public async projects(): Promise<Project[]> {
    const possibleProjectDirectories = await Util.subdirectories(Util.pathTo.projects);
    return await Util.returnResolved(possibleProjectDirectories.map((possibleProjectDirectory) => {
      return this.projectService.read(possibleProjectDirectory.name);
    }));
  }

  /**
   * CRUD methods to work with projects
   */
  public get project(): ProjectService {
    return this.projectService;
  }

  /**
   * Searches for assets of given project on disk, loads and returns them
   * 
   * @param project Project to get the assets from
   */
  public async assets(project: Project): Promise<Asset[]> {
    return this.getModelsFromFiles<Asset>(project, Util.pathTo.assets(project.id), this.assetService);
  }

  /**
   * CRUD methods to work with assets
   */
  public get asset(): AssetService {
    return this.assetService;
  }

  /**
   * Searches for pages of given project on disk, loads and returns them
   * 
   * @param project Project to get the pages from
   */
  public async pages(project: Project): Promise<Page[]> {
    return this.getModelsFromFiles<Page>(project, Util.pathTo.pages(project.id), this.pageService);
  }

  /**
   * CRUD methods to work with pages
   */
  public get page(): PageService {
    return this.pageService;
  }

  /**
   * Searches for blocks of given project on disk, loads and returns them
   * 
   * @param project Project to get the blocks from
   */
  public async blocks(project: Project): Promise<Block[]> {
    return this.getModelsFromFiles<Block>(project, Util.pathTo.blocks(project.id), this.blockService);
  }

  /**
   * CRUD methods to work with blocks
   */
  public get block(): BlockService {
    return this.blockService;
  }

  /**
   * Searches for snapshots of given project and returns them
   * 
   * @param project Project to get the snapshots from
   */
  public async snapshots(project: Project): Promise<Snapshot[]> {
    return this.snapshotService.list(project);
  }

  /**
   * CRUD methods to work with snapshots
   */
  public get snapshot(): SnapshotService {
    return this.snapshotService;
  }

  /**
   * CRUD methods to work with the theme
   */
  public get theme(): ThemeService {
    return this.themeService;
  }

  /**
   * @todo Hacked together for now, refactor
   * 
   * @param project 
   */
  public async export(project: Project) {
    const theme = await this.theme.read(project);
    const pages = await this.pages(project);
    return {
      ...project,
      pages: await Promise.all(pages.map( async (page) => {
        const layout = theme.layouts.find((layout) => {
          return layout.id === page.layoutId;
        });
        if (!layout) { throw new Error('Layout not found'); }
        const layoutPositions = await this.themeService.getPositions(project, layout);
        return {
          name: page.name,
          language: page.language,
          layout: {
            id: layout.id,
            path: layout.path
          },
          uriPath: page.uriPath,
          content: await Promise.all(page.content.map( async (contentRef) => {
            const block = await this.blockService.read(project, contentRef.blockId, page.language);
            const blockPosition = layoutPositions.blocks.find((position) => {
              return position.id === contentRef.positionId;
            });
            if (!blockPosition) { throw new Error('Block position not found'); }
            return {
              id: contentRef.positionId,
              html: this.blockService.render(block, blockPosition.restrictions)
            };
          }))
        };
      }))
    };
  }

  /**
   * Builds given project by hydrating the theme with the projects information 
   * and saving the outcome to the projects "public" directory
   * 
   * @todo check how to prevent remote code execution here,
   * since running a user defined command is generally a very bad idea...
   * 
   * Ok, so this seems to be one of the main challenges to get this project going.
   * Currently this solution works. For a developer it might be ok to write a theme,
   * then using it like this - he wrote the code himself. But for an end-user this is horrible.
   * Using a theme like this means running external code with full access on your private
   * or companies computer. E.g. a theme update now containing a "rm -rf /" as the build command.
   * 
   * A few (not so great) solutions that come to my mind:
   * - Do not use npm run to execute self defined commands. Instead direktly invoke e.g. the Vue CLI.
   *   = a bit more secure but not really
   * - Use a container technology to execute code in (Docker etc.)
   *   = better security, more overhead and complexity
   * - Use a VM technology to execute code in (VirtualBox etc.)
   *   = even more overhead & complexity but also more secure
   * - Just don't allow themes to be build locally if they are not from a trusted source
   *   = limits the usability
   */
  public async build(project: Project): Promise<void> {
    const theme = await this.themeService.read(project);
    const themePath = Util.pathTo.theme(project.id);
    const exportPath = Path.join(themePath, theme.exportFile);
    const exportData = await this.export(project);
    const buildPath = Path.join(themePath, theme.buildDir);
    const publicPath = Util.pathTo.public(project.id);

    // Export the projects data to the export file, defined by the theme
    await this.jsonFileService.update(exportData, exportPath);
    
    // Install the themes dependencies
    await Util.spawnChildProcess('npm', ['install'], {
      cwd: Path.join(themePath)
    });

    // Run the build script which uses the exported json
    // to hydrate the themes content
    await Util.spawnChildProcess('npm', ['run', 'build'], {
      cwd: Path.join(themePath)
    });

    // Copy the contents of themes "buildDir" to the projects public directory
    // where it's available from outside
    await Fs.emptyDir(publicPath);
    await Fs.copy(buildPath, publicPath);
  }

  /**
   * Returns an array of instanciated models from given service,
   * that tries to load the model data from all files it finds
   * under given path
   * 
   * @todo Check how we could get full type safety from using CrudService interface,
   * since currently it only uses `...args: any;`
   * 
   * @param project Project to load the models from
   * @param path Path to search for files in
   * @param service Service that instanciates the models with data off of files loaded
   */
  private async getModelsFromFiles<T>(project: Project, path: string, service: CrudService): Promise<T[]> {
    const possibleFiles = await Util.files(path);
    return await Util.returnResolved(possibleFiles.map((possibleFile) => {
      const fileNameArray = possibleFile.name.split('.');
      return service.read(project, fileNameArray[0], fileNameArray[1]);
    }));
  }
}
