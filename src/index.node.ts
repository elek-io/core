import Fs from 'fs-extra';
import * as packageJson from '../package.json' with { type: 'json' };
import { LocalApi } from './api/index.js';
import type { Version } from './schema/index.js';
import {
  constructorElekIoCoreSchema,
  type ConstructorElekIoCoreProps,
  type ElekIoCoreOptions,
} from './schema/index.js';
import {
  AccountService,
  AssetService,
  CacheService,
  CloudService,
  CollectionService,
  ComponentService,
  EntryService,
  GitService,
  JsonFileService,
  ProjectService,
  ReferenceService,
  ReleaseService,
  ReportService,
  UserService,
} from './service/index.js';
import { LogService } from './service/LogService.js';
import { CloudClient } from './util/cloud.js';
import { GitCredentialRelay } from './util/gitCredentialRelay.js';
import {
  createPathTo,
  resolveCloudGitUrl,
  resolveCloudToken,
  resolveCloudUrl,
  resolveDataDir,
  resolveLogLevel,
  resolveReadOnly,
  resolveRemoteAccessToken,
  type PathTo,
} from './util/node.js';
import { CoreError } from './util/shared.js';
import { finishesWithin, TEARDOWN_BOUND_MS } from './util/teardown.js';

// Export all schemas and shared code that works inside node environments,
// including code that requires filesystem access / git integration etc.
export * from './schema/index.js';
export * from './util/shared.js';
// The `cause` an update throws, so a consumer can branch on it
export type * from './util/entryIssue.js';

/**
 * One step of `dispose()`, as a stall names it.
 *
 * The local API and the credential relay each release a loopback port, the
 * logger flushes what Core wrote and hands the process-level handlers back.
 */
export type DisposeStep = 'local API' | 'credential relay' | 'logger';

/**
 * What `dispose()` gave up on, so a host can say so instead of guessing.
 *
 * `stalledSteps` is empty when every step finished, which is the ordinary
 * case. A stalled step also leaves a `warn` record behind, except the
 * logger, whose own stream has ended by the time it is known.
 */
export interface DisposeResult {
  stalledSteps: DisposeStep[];
}

/**
 * elek.io Core, the entry point every service hangs off.
 *
 * Constructing it resolves the `ELEK_IO_` environment variables once, never
 * at import, creates `<dataDir>/projects` and empties `<dataDir>/tmp` on
 * disk, and registers process-level exception and rejection handlers unless
 * `log.hasProcessErrorHandlers` is false. Throws `BadRequest` on invalid
 * options and on an unusable `ELEK_IO_LOG_LEVEL`, `ELEK_IO_CLOUD_URL`,
 * `ELEK_IO_CLOUD_GIT_URL` or `ELEK_IO_CLOUD_TOKEN`.
 *
 * @see ../docs/usage.md
 */
export default class ElekIoCore {
  public readonly coreVersion: Version;
  public readonly options: ElekIoCoreOptions;
  private readonly pathTo: PathTo;
  private readonly utilities: { pathTo: PathTo };
  private readonly logService: LogService;
  private readonly userService: UserService;
  private readonly gitService: GitService;
  private readonly jsonFileService: JsonFileService;
  private readonly cacheService: CacheService;
  private readonly assetService: AssetService;
  private readonly projectService: ProjectService;
  private readonly collectionService: CollectionService;
  private readonly componentService: ComponentService;
  private readonly entryService: EntryService;
  private readonly referenceService: ReferenceService;
  private readonly releaseService: ReleaseService;
  private readonly cloudClient: CloudClient;
  private readonly gitCredentialRelay: GitCredentialRelay;
  private readonly accountService: AccountService;
  private readonly reportService: ReportService;
  private readonly cloudService: CloudService;
  private readonly localApi: LocalApi;

  constructor(props?: ConstructorElekIoCoreProps) {
    this.coreVersion = packageJson.default.version;
    const parsedProps = constructorElekIoCoreSchema.safeParse(props);
    if (parsedProps.success === false) {
      throw CoreError.badRequest(parsedProps.error.message, parsedProps.error);
    }

    const cloudUrl = resolveCloudUrl(parsedProps.data?.cloud?.url);
    this.options = {
      log: {
        level: resolveLogLevel(parsedProps.data?.log?.level),
        hasProcessErrorHandlers:
          parsedProps.data?.log?.hasProcessErrorHandlers ?? true,
        // Spread rather than assigned, so an undeclared host version stays
        // absent instead of being written as an explicit undefined
        ...(parsedProps.data?.log?.hostVersion === undefined
          ? {}
          : { hostVersion: parsedProps.data.log.hostVersion }),
      },
      cache: parsedProps.data?.cache ?? true,
      dataDir: resolveDataDir(parsedProps.data?.dataDir),
      cloud: {
        url: cloudUrl,
        gitUrl: resolveCloudGitUrl(parsedProps.data?.cloud?.gitUrl, cloudUrl),
      },
      isReadOnly: resolveReadOnly(parsedProps.data?.isReadOnly),
    };
    // The token is a credential Core may forget while it runs, so it stays
    // out of the options, which are configuration a host may log. Resolved
    // before the logger, which registers process handlers a throw would leak
    const cloudToken = resolveCloudToken(parsedProps.data?.cloud?.token);
    const remoteToken = resolveRemoteAccessToken();
    this.pathTo = createPathTo(this.options.dataDir);
    this.utilities = { pathTo: this.pathTo };

    this.logService = new LogService(this.options, this.pathTo);
    this.cloudClient = new CloudClient(
      this.options.cloud.url,
      this.coreVersion,
      cloudToken,
      this.logService
    );
    this.gitCredentialRelay = new GitCredentialRelay({
      cloudGitUrl: this.options.cloud.gitUrl,
      remoteToken,
      cloudClient: this.cloudClient,
      logService: this.logService,
      pathTo: this.pathTo,
    });
    this.cacheService = new CacheService(this.options.cache);
    this.jsonFileService = new JsonFileService(
      this.options,
      this.pathTo,
      this.logService,
      this.cacheService
    );
    this.userService = new UserService(
      this.pathTo,
      this.logService,
      this.jsonFileService
    );
    this.gitService = new GitService(
      this.options,
      this.pathTo,
      this.logService,
      this.userService,
      this.cacheService,
      this.gitCredentialRelay
    );
    this.referenceService = new ReferenceService(
      this.coreVersion,
      this.options,
      this.pathTo,
      this.logService,
      this.gitService,
      this.jsonFileService,
      this.cacheService
    );
    this.collectionService = new CollectionService(
      this.coreVersion,
      this.options,
      this.pathTo,
      this.logService,
      this.jsonFileService,
      this.cacheService,
      this.gitService,
      this.referenceService
    );
    this.componentService = new ComponentService(
      this.coreVersion,
      this.options,
      this.pathTo,
      this.logService,
      this.jsonFileService,
      this.cacheService,
      this.gitService
    );
    this.entryService = new EntryService(
      this.coreVersion,
      this.options,
      this.pathTo,
      this.logService,
      this.jsonFileService,
      this.cacheService,
      this.gitService,
      this.collectionService,
      this.componentService,
      this.referenceService
    );
    this.assetService = new AssetService(
      this.coreVersion,
      this.options,
      this.pathTo,
      this.logService,
      this.jsonFileService,
      this.cacheService,
      this.gitService,
      this.referenceService
    );
    this.projectService = new ProjectService(
      this.coreVersion,
      this.options,
      this.pathTo,
      this.logService,
      this.jsonFileService,
      this.cacheService,
      this.gitService,
      this.assetService,
      this.collectionService,
      this.componentService,
      this.entryService,
      this.referenceService
    );
    this.releaseService = new ReleaseService(
      this.options,
      this.pathTo,
      this.logService,
      this.gitService,
      this.jsonFileService,
      this.projectService
    );
    this.reportService = new ReportService(
      this.coreVersion,
      this.options,
      this.pathTo,
      this.logService,
      this.cloudClient
    );
    this.accountService = new AccountService(
      this.options,
      this.pathTo,
      this.logService,
      this.cloudClient,
      this.userService
    );
    this.cloudService = new CloudService(
      this.accountService,
      this.reportService
    );

    // Every cache that mirrors a working tree, cleared together whenever
    // git or Core changes one. See CacheService
    this.cacheService.register(() => this.jsonFileService.clearCache());
    this.cacheService.register(() => this.collectionService.clearSlugIndex());
    this.cacheService.register(() => this.componentService.clearSlugIndex());

    this.localApi = new LocalApi(
      this.logService,
      this.projectService,
      this.collectionService,
      this.componentService,
      this.entryService,
      this.assetService
    );

    this.logService.info({
      source: 'core',
      message: `Initializing elek.io Core ${this.coreVersion}`,
      meta: {
        'elek.options.log.level': this.options.log.level,
        'elek.options.log.has_process_error_handlers':
          this.options.log.hasProcessErrorHandlers,
        'elek.options.cache': this.options.cache,
        'elek.options.data_dir': this.options.dataDir,
        'elek.options.is_read_only': this.options.isReadOnly,
      },
    });
    if (this.options.cloud.gitUrl === null) {
      this.logService.warn({
        source: 'core',
        message:
          'Installs no credential helper for elek.io Cloud\'s git hosts, because the host of cloud.url carries no "api." label to derive them from. Set cloud.gitUrl or ELEK_IO_CLOUD_GIT_URL',
      });
    }

    Fs.mkdirpSync(this.pathTo.projects);
    Fs.mkdirpSync(this.pathTo.tmp);
    Fs.emptyDirSync(this.pathTo.tmp);
  }

  /**
   * The same `LogService` Core writes its own records through. Records land
   * in daily rotated JSONL files under `<dataDir>/logs`, each built from an
   * allowlist so nothing a User typed reaches a log file.
   *
   * `dispose()` closes it.
   */
  public get logger() {
    return this.logService;
  }

  /**
   * Utility / helper functions
   *
   * The exposed pathTo is rooted at this instances resolved dataDir
   */
  public get util() {
    return this.utilities;
  }

  /**
   * Shells out to real git through dugite, against a Project's repository on
   * disk. An escape hatch below the services rather than an alternative to
   * them.
   *
   * A mutating command throws `PreconditionFailed` in read-only mode, and
   * `Unauthorized` when no User is set, because a commit is authored with
   * that User.
   */
  public get git(): GitService {
    return this.gitService;
  }

  /**
   * The User currently working with Core, stored once per data directory in
   * `user.json` rather than per Project.
   *
   * It authors every commit, so it has to be set before any mutating call
   * unless Core runs read-only.
   */
  public get user(): UserService {
    return this.userService;
  }

  /**
   * Projects, each its own git repository under `<dataDir>/projects/<id>`.
   * `clone`, `provision`, `synchronize` and the `branches` calls live here
   * too, and every mutating call commits.
   *
   * @see ../docs/git-and-sync.md
   */
  public get projects(): ProjectService {
    return this.projectService;
  }

  /**
   * Assets, each two files: the binary and its `.json` metadata. Deleting one
   * an Entry still references throws `Conflict`.
   *
   * @see ../docs/asset-management.md
   */
  public get assets(): AssetService {
    return this.assetService;
  }

  /**
   * Collections, each carrying the field definitions every Entry inside it
   * has to follow. Editing them cascades into the existing Entries.
   *
   * @see ../docs/schema-changes.md
   */
  public get collections(): CollectionService {
    return this.collectionService;
  }

  /**
   * Components, reusable named groups of field definitions that Collections
   * reference, so a change here reaches every Collection using it.
   *
   * @see ../docs/concepts.md
   */
  public get components(): ComponentService {
    return this.componentService;
  }

  /**
   * Entries. Every write is validated against the Collection's field
   * definitions, its unique fields and its reference targets before anything
   * reaches disk, and a successful call commits.
   *
   * @see ../docs/references.md
   */
  public get entries(): EntryService {
    return this.entryService;
  }

  /**
   * Scans Entry references (reverse delete gates, forward write and sync gates)
   */
  public get references(): ReferenceService {
    return this.referenceService;
  }

  /**
   * Releases. Diffs the `draft` branch against `main`, computes the
   * semver bump from what changed, and merges, leaving a tagged snapshot.
   *
   * @see ../docs/releases.md
   */
  public get releases(): ReleaseService {
    return this.releaseService;
  }

  /**
   * Everything Core does against elek.io Cloud: signing in to an account
   * and sending a bug report or feedback
   */
  public get cloud(): CloudService {
    return this.cloudService;
  }

  /**
   * The local, read-only REST API over the Projects in this data directory.
   * Assembled with Core, but nothing listens until `start()`.
   *
   * @see ../docs/local-api.md
   */
  public get api(): LocalApi {
    return this.localApi;
  }

  /**
   * Stops the local API and the loopback listener git's credential helper
   * reaches, then closes the logger, removing the process-level exception
   * and rejection handlers. A step that finishes releases what it held.
   *
   * Every step is bounded, so one that never finishes costs seconds rather
   * than the host's whole shutdown, and `stalledSteps` names it. Safe to
   * call twice, and a record logged afterwards is dropped rather than
   * thrown at the ended stream.
   *
   * @see ../docs/usage.md
   */
  public async dispose(): Promise<DisposeResult> {
    const stalledSteps: DisposeStep[] = [];
    const bounded = async (step: DisposeStep, work: Promise<unknown>) => {
      if (await finishesWithin(work, TEARDOWN_BOUND_MS)) {
        return;
      }
      stalledSteps.push(step);
      this.logService.warn({
        source: 'core',
        message: `Gave up on the ${step} after ${TEARDOWN_BOUND_MS}ms while disposing elek.io Core`,
        meta: {
          'elek.teardown.step': step,
          'elek.duration_ms': TEARDOWN_BOUND_MS,
        },
      });
    };

    await bounded('local API', this.localApi.stop());
    await bounded('credential relay', this.gitCredentialRelay.close());
    // Logged before closing so the final line is flushed
    this.logService.info({ source: 'core', message: 'Disposing elek.io Core' });
    // The logger bounds its own flush and reports it, because the record
    // that would name it cannot reach a stream winston has ended. Bounded
    // here too, so a logger that never resolves at all stops here as well
    const closing = this.logService.close();
    if (
      (await finishesWithin(closing, TEARDOWN_BOUND_MS)) === false ||
      (await closing) === false
    ) {
      stalledSteps.push('logger');
    }

    return { stalledSteps };
  }
}
