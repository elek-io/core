import Fs from 'fs-extra';
import { isDeepStrictEqual } from 'node:util';
import {
  addWebsiteSchema,
  checkAllDestinationSchema,
  checkDestinationSchema,
  collectionFileSchema,
  countDestinationsSchema,
  deleteDestinationSchema,
  destinationFileSchema,
  entryFileSchema,
  keepDestinationVersionSchema,
  listDestinationsSchema,
  newerDestinationVersionsSchema,
  objectTypeSchema,
  readDestinationSchema,
  serviceTypeSchema,
  switchDestinationVersionSchema,
  updateDestinationSchema,
  type AddWebsiteProps,
  type CheckAllDestinationProps,
  type CheckDestinationProps,
  type CollectionFile,
  type Contract,
  type CountDestinationsProps,
  type DeleteDestinationProps,
  type DestinationFile,
  type ElekIoCoreOptions,
  type KeepDestinationVersionProps,
  type ListDestinationsProps,
  type Mapping,
  type NewerDestinationVersionsProps,
  type PaginatedList,
  type ReadDestinationProps,
  type SwitchDestinationVersionProps,
  type UpdateDestinationProps,
  type Uuid,
} from '../schema/index.js';
import {
  entryIssuesOf,
  mappingByMatchingIds,
  mappingForVersion,
  mappingIssuesOf,
} from '../util/destinationCheck.js';
import type { DestinationIssue } from '../util/destinationIssue.js';
import type {
  KeptVersion,
  SwitchedVersion,
} from '../util/destinationVersion.js';
import type { PathTo } from '../util/node.js';
import { CoreError, datetime, uuid } from '../util/shared.js';
import { isNewerVersion } from '../util/theme.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import type { CacheService } from './CacheService.js';
import type { ContractService } from './ContractService.js';
import type { GitService } from './GitService.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * Destinations, each the folder `destinations/<uuid>/` holding
 * `destination.json`: one place a Project's content goes, the Contract it
 * follows, the version of it in use and the Mapping that fills it.
 *
 * A website is the one kind. `addWebsite()` reads a theme's Contract from
 * its git address, keeps it in the Project and writes the Destination,
 * `check()` and `checkAll()` say what the website cannot take, and
 * `keepVersion()` and `switchVersion()` follow a theme's newer version.
 *
 * @see ../../docs/destinations.md
 */
export class DestinationService extends AbstractEntityService {
  private coreVersion: string;
  private contractService: ContractService;

  public constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    gitService: GitService,
    jsonFileService: JsonFileService,
    cacheService: CacheService,
    contractService: ContractService
  ) {
    super(
      serviceTypeSchema.enum.Destination,
      options,
      pathTo,
      logService,
      gitService,
      jsonFileService,
      cacheService
    );
    this.coreVersion = coreVersion;
    this.contractService = contractService;
  }

  /**
   * Adds a website to the Project from its theme's git address, at the
   * newest version the theme tagged or at the one given, and commits.
   *
   * The Contract is kept once per address, and the Mapping starts out
   * filling every field of the Contract whose id the Project's own field
   * definitions carry. Throws `PreconditionFailed` in read-only mode and on
   * a provisioned copy, `Conflict` on a name in use, and whatever
   * `ContractService.readFromTheme` throws, each before anything is written.
   *
   * @see ../../docs/destinations.md
   */
  public async addWebsite(props: AddWebsiteProps): Promise<DestinationFile> {
    this.assertNotReadOnly('addWebsite');
    const { projectId } = this.parseOrThrow(
      'addWebsite',
      addWebsiteSchema.pick({ projectId: true }),
      props
    );
    await this.assertNotProvisioned('addWebsite', projectId);

    return this.mutating(
      'addWebsite',
      addWebsiteSchema,
      props,
      async (validatedProps) => {
        await this.assertNameIsFree(
          validatedProps.projectId,
          validatedProps.name
        );

        const theme = await this.contractService.readFromTheme({
          url: validatedProps.url,
          ...(validatedProps.version === undefined
            ? {}
            : { version: validatedProps.version }),
        });
        const kept = await this.contractService.keep({
          projectId: validatedProps.projectId,
          origin: { kind: 'git', url: validatedProps.url },
          contract: theme.contract,
          commit: theme.commit,
        });

        const id = uuid();
        const projectPath = this.pathTo.project(validatedProps.projectId);
        const destinationPath = this.pathTo.destination(
          validatedProps.projectId,
          id
        );
        const destinationFilePath = this.pathTo.destinationFile(
          validatedProps.projectId,
          id
        );
        const destinationFile: DestinationFile = {
          objectType: 'destination',
          id,
          coreVersion: this.coreVersion,
          created: datetime(),
          updated: null,
          name: validatedProps.name,
          kind: 'website',
          contract: { id: kept.id, version: theme.version },
          mapping: mappingByMatchingIds({
            contract: theme.contract,
            collections: await this.readCollections(validatedProps.projectId),
          }),
          waiting: null,
        };

        await this.withGitRollback(projectPath, async () => {
          await Fs.ensureDir(destinationPath);
          await this.jsonFileService.create(
            destinationFile,
            destinationFilePath,
            destinationFileSchema
          );
          await this.gitService.add(projectPath, [destinationFilePath]);
          await this.gitService.commit(projectPath, {
            method: 'create',
            reference: { objectType: 'destination', id },
          });
        }, [destinationPath]);

        return destinationFile;
      }
    );
  }

  /**
   * A Destination of the Project. Throws `NotFound` when it holds none
   * under that id.
   */
  public async read(props: ReadDestinationProps): Promise<DestinationFile> {
    return this.validated(
      'read',
      readDestinationSchema,
      props,
      async (validatedProps) => {
        return this.jsonFileService.read(
          this.pathTo.destinationFile(
            validatedProps.projectId,
            validatedProps.id
          ),
          destinationFileSchema
        );
      }
    );
  }

  /**
   * Renames a Destination, replaces the Mapping of the version in use, the
   * Mapping of the version that waits, or all of them, and commits. What is
   * left out stays as it is, and no version in use changes here.
   *
   * Throws `PreconditionFailed` in read-only mode, on a provisioned copy and
   * for a `waitingMapping` while no version waits, `Conflict` on a name
   * another Destination uses, and `NotFound` for an unknown id.
   */
  public async update(props: UpdateDestinationProps): Promise<DestinationFile> {
    this.assertNotReadOnly('update');
    const { projectId } = this.parseOrThrow(
      'update',
      updateDestinationSchema.pick({ projectId: true }),
      props
    );
    await this.assertNotProvisioned('update', projectId);

    return this.mutating(
      'update',
      updateDestinationSchema,
      props,
      async (validatedProps) => {
        const previous = await this.read(validatedProps);
        if (
          validatedProps.name !== undefined &&
          validatedProps.name !== previous.name
        ) {
          await this.assertNameIsFree(
            validatedProps.projectId,
            validatedProps.name,
            validatedProps.id
          );
        }
        if (
          validatedProps.waitingMapping !== undefined &&
          previous.waiting === null
        ) {
          throw CoreError.preconditionFailed(
            `No version of its Contract waits beside the one Destination "${validatedProps.id}" uses, so there is no Mapping of a waiting version to replace`
          );
        }
        const waiting =
          validatedProps.waitingMapping === undefined ||
          previous.waiting === null
            ? previous.waiting
            : { ...previous.waiting, mapping: validatedProps.waitingMapping };

        return this.write(validatedProps.projectId, {
          ...previous,
          ...(validatedProps.name === undefined
            ? {}
            : { name: validatedProps.name }),
          ...(validatedProps.mapping === undefined
            ? {}
            : { mapping: validatedProps.mapping }),
          waiting,
        });
      }
    );
  }

  /**
   * Removes a Destination and commits. The Contract it followed stays in the
   * Project, whether or not another Destination still uses it.
   *
   * Throws `PreconditionFailed` in read-only mode and on a provisioned copy,
   * and `NotFound` for an unknown id.
   */
  public async delete(props: DeleteDestinationProps): Promise<void> {
    this.assertNotReadOnly('delete');
    const { projectId } = this.parseOrThrow(
      'delete',
      deleteDestinationSchema.pick({ projectId: true }),
      props
    );
    await this.assertNotProvisioned('delete', projectId);

    return this.mutating(
      'delete',
      deleteDestinationSchema,
      props,
      async (validatedProps) => {
        // Read first, so an unknown id is NotFound rather than a commit of
        // nothing
        await this.read(validatedProps);
        const projectPath = this.pathTo.project(validatedProps.projectId);
        const destinationPath = this.pathTo.destination(
          validatedProps.projectId,
          validatedProps.id
        );

        await this.withGitRollback(projectPath, async () => {
          // Through the file service, so what it cached below the folder goes
          // with it and a later read does not answer from the cache
          await this.jsonFileService.delete(destinationPath);
          await this.gitService.add(projectPath, [destinationPath]);
          await this.gitService.commit(projectPath, {
            method: 'delete',
            reference: { objectType: 'destination', id: validatedProps.id },
          });
        });
      }
    );
  }

  /**
   * One page of the Project's Destinations, newest first.
   *
   * Every Destination is read before the page is cut, because the folder
   * order says nothing about when one was added, so `total` counts the
   * folders while the page comes out of the ones that read.
   *
   * A Project holding no `destinations` folder, which every Project written
   * before Destinations existed is, lists nothing rather than failing.
   */
  public async list(
    props: ListDestinationsProps
  ): Promise<PaginatedList<DestinationFile>> {
    return this.validated(
      'list',
      listDestinationsSchema,
      props,
      async (validatedProps) => {
        const limit = validatedProps.limit ?? 15;
        const offset = validatedProps.offset ?? 0;
        const ids = await this.destinationIds(validatedProps.projectId);
        const destinations = await this.collectResults(
          ids.map((id) =>
            this.read({ projectId: validatedProps.projectId, id })
          )
        );
        const newestFirst = destinations.toSorted((a, b) => {
          return b.created.localeCompare(a.created);
        });
        return {
          total: ids.length,
          limit,
          offset,
          list:
            limit === 0
              ? newestFirst.slice(offset)
              : newestFirst.slice(offset, offset + limit),
        };
      }
    );
  }

  /** How many Destinations the Project holds, without reading one */
  public async count(props: CountDestinationsProps): Promise<number> {
    return this.validated(
      'count',
      countDestinationsSchema,
      props,
      async (validatedProps) => {
        return (await this.destinationIds(validatedProps.projectId)).length;
      }
    );
  }

  /**
   * What the Destination cannot take about one Entry: every issue of its
   * Mapping, and every Value of that Entry the Contract refuses.
   *
   * Empty when the Entry fits. An Entry whose Collection fills nothing of
   * the Contract raises no issue of its own, and the Mapping's issues still
   * come back. The Mapping is read against the Collections the Project holds
   * now, so it reads every one of them.
   *
   * With `isWaitingVersion` it reads the version that waits and its own
   * Mapping, and throws `PreconditionFailed` while none waits.
   */
  public async check(
    props: CheckDestinationProps
  ): Promise<DestinationIssue[]> {
    return this.validated(
      'check',
      checkDestinationSchema,
      props,
      async (validatedProps) => {
        const { destination, contract, mapping } = await this.readWithContract(
          validatedProps.projectId,
          validatedProps.id,
          validatedProps.isWaitingVersion
        );
        const collection = await this.jsonFileService.read(
          this.pathTo.collectionFile(
            validatedProps.projectId,
            validatedProps.collectionId
          ),
          collectionFileSchema
        );
        const entry = await this.jsonFileService.read(
          this.pathTo.entryFile(
            validatedProps.projectId,
            validatedProps.collectionId,
            validatedProps.entryId
          ),
          entryFileSchema
        );

        return [
          ...mappingIssuesOf({
            destinationId: destination.id,
            contract,
            mapping,
            collections: await this.readCollections(validatedProps.projectId),
          }),
          ...entryIssuesOf({
            destinationId: destination.id,
            contract,
            mapping,
            collection,
            entry,
            languages: await this.readProjectLanguages(
              validatedProps.projectId
            ),
          }),
        ];
      }
    );
  }

  /**
   * What the Destination cannot take about the whole Project: every issue of
   * its Mapping once, and every Value of every Entry the Contract refuses.
   *
   * Empty when the website can take the Project as it is. It reads every
   * Collection of the Project and every Entry of the mapped ones, so it
   * costs one read per Entry.
   *
   * With `isWaitingVersion` it reads the version that waits and its own
   * Mapping, and throws `PreconditionFailed` while none waits.
   */
  public async checkAll(
    props: CheckAllDestinationProps
  ): Promise<DestinationIssue[]> {
    return this.validated(
      'checkAll',
      checkAllDestinationSchema,
      props,
      async (validatedProps) => {
        const { destination, contract, mapping } = await this.readWithContract(
          validatedProps.projectId,
          validatedProps.id,
          validatedProps.isWaitingVersion
        );

        return this.projectIssues(validatedProps.projectId, {
          destination,
          contract,
          mapping,
        });
      }
    );
  }

  /**
   * The versions tagged at the website's theme that are newer than the one
   * it uses, newest first, read with the person's own git access. Empty when
   * it uses the newest.
   *
   * The version that waits is among them until the website switches to it.
   * Throws what `core.contracts.versionsFromTheme()` throws about the
   * address, and `NotFound` for a Destination the Project does not hold.
   *
   * @see ../../docs/destinations.md
   */
  public async newerVersions(
    props: NewerDestinationVersionsProps
  ): Promise<string[]> {
    return this.validated(
      'newerVersions',
      newerDestinationVersionsSchema,
      props,
      async (validatedProps) => {
        const destination = await this.read(validatedProps);
        const kept = await this.contractService.read({
          projectId: validatedProps.projectId,
          id: destination.contract.id,
        });
        const versions = await this.contractService.versionsFromTheme({
          url: kept.origin.url,
        });
        return versions.filter((version) => {
          return isNewerVersion(version, destination.contract.version);
        });
      }
    );
  }

  /**
   * Keeps a newer version of the theme's Contract beside the one in use, with
   * a Mapping of its own, and commits. The newest version tagged is taken
   * unless one is given, and the website stays on the version it uses.
   *
   * Every version newer than the one in use replaces the one that waits, and
   * the one that already waits fills what the Project has gained. Both keep
   * what was mapped. Throws `PreconditionFailed` for an older version and
   * `BadRequest` for one named differently, before anything is written.
   *
   * @see ../../docs/destinations.md
   */
  public async keepVersion(
    props: KeepDestinationVersionProps
  ): Promise<KeptVersion> {
    this.assertNotReadOnly('keepVersion');
    const { projectId } = this.parseOrThrow(
      'keepVersion',
      keepDestinationVersionSchema.pick({ projectId: true }),
      props
    );
    await this.assertNotProvisioned('keepVersion', projectId);

    return this.mutating(
      'keepVersion',
      keepDestinationVersionSchema,
      props,
      async (validatedProps) => {
        const destination = await this.read(validatedProps);
        const kept = await this.contractService.read({
          projectId: validatedProps.projectId,
          id: destination.contract.id,
        });
        const theme = await this.contractService.readFromTheme({
          url: kept.origin.url,
          ...(validatedProps.version === undefined
            ? {}
            : { version: validatedProps.version }),
        });

        if (theme.version === destination.contract.version) {
          return {
            outcome: 'in-use' as const,
            version: theme.version,
            destination,
          };
        }
        if (
          isNewerVersion(theme.version, destination.contract.version) === false
        ) {
          throw CoreError.preconditionFailed(
            `Version "${theme.version}" of the theme is older than version "${destination.contract.version}", which Destination "${destination.id}" uses. Name a newer version, or add a website on the older one.`
          );
        }
        // The name of the version this website uses, rather than the one
        // `contract.json` carries, which a second website keeping a renamed
        // version of the same theme writes
        const inUse = await this.contractService.readVersion({
          projectId: validatedProps.projectId,
          id: destination.contract.id,
          version: destination.contract.version,
        });
        if (theme.contract.name !== inUse.contract.name) {
          throw CoreError.badRequest(
            `Version "${theme.version}" of the theme carries the Contract "${theme.contract.name}" while Destination "${destination.id}" follows "${inUse.contract.name}". Keep the name the Contract had, or add a website for the other theme.`
          );
        }

        await this.contractService.keep({
          projectId: validatedProps.projectId,
          origin: kept.origin,
          contract: theme.contract,
          commit: theme.commit,
        });
        // Through the copy the Project keeps rather than what the theme just
        // answered. A copy is never rewritten, so a theme that moved the tag
        // leaves the kept one in place, and that is the Contract a switch
        // would put the website on
        const copy = await this.contractService.readVersion({
          projectId: validatedProps.projectId,
          id: destination.contract.id,
          version: theme.version,
        });
        const carryFrom =
          destination.waiting === null
            ? [destination.mapping]
            : [destination.waiting.mapping, destination.mapping];
        const waiting = {
          version: theme.version,
          mapping: mappingForVersion({
            contract: copy.contract,
            collections: await this.readCollections(validatedProps.projectId),
            carryFrom,
          }),
        };
        // The Mapping of a version that already waits is built again, so a
        // field definition the Project gained since the last run fills what
        // it left unmapped. Nothing is written while it fills the same
        if (
          destination.waiting?.version === waiting.version &&
          isDeepStrictEqual(destination.waiting.mapping, waiting.mapping)
        ) {
          return {
            outcome: 'waiting' as const,
            version: theme.version,
            destination,
          };
        }

        return {
          outcome: 'waiting' as const,
          version: theme.version,
          destination: await this.write(validatedProps.projectId, {
            ...destination,
            waiting,
          }),
        };
      }
    );
  }

  /**
   * Switches the website to the version that waits, with the Mapping that
   * waits with it, and commits. Nothing waits afterwards.
   *
   * It switches only once nothing of the Project is left that the waiting
   * version cannot take. Otherwise the website keeps the version it uses and
   * the outcome is `kept`, with every item named in `issues`. Throws
   * `PreconditionFailed` while no version waits.
   *
   * @see ../../docs/destinations.md
   */
  public async switchVersion(
    props: SwitchDestinationVersionProps
  ): Promise<SwitchedVersion> {
    this.assertNotReadOnly('switchVersion');
    const { projectId } = this.parseOrThrow(
      'switchVersion',
      switchDestinationVersionSchema.pick({ projectId: true }),
      props
    );
    await this.assertNotProvisioned('switchVersion', projectId);

    return this.mutating(
      'switchVersion',
      switchDestinationVersionSchema,
      props,
      async (validatedProps) => {
        const { destination, contract, mapping } = await this.readWithContract(
          validatedProps.projectId,
          validatedProps.id,
          true
        );
        const waiting = destination.waiting;
        if (waiting === null) {
          throw CoreError.preconditionFailed(
            `No version of its Contract waits beside the one Destination "${destination.id}" uses`
          );
        }

        const issues = await this.projectIssues(validatedProps.projectId, {
          destination,
          contract,
          mapping,
        });
        if (issues.length > 0) {
          return { outcome: 'kept' as const, issues, destination };
        }

        return {
          outcome: 'switched' as const,
          issues,
          destination: await this.write(validatedProps.projectId, {
            ...destination,
            contract: { ...destination.contract, version: waiting.version },
            mapping: waiting.mapping,
            waiting: null,
          }),
        };
      }
    );
  }

  /**
   * What the Destination cannot take about the whole Project, through the
   * Contract and Mapping given, so one check serves the version in use and
   * the one that waits.
   */
  private async projectIssues(
    projectId: Uuid,
    through: {
      destination: DestinationFile;
      contract: Contract;
      mapping: Mapping;
    }
  ): Promise<DestinationIssue[]> {
    const languages = await this.readProjectLanguages(projectId);
    const collections = await this.readCollections(projectId);
    const issues: DestinationIssue[] = mappingIssuesOf({
      destinationId: through.destination.id,
      contract: through.contract,
      mapping: through.mapping,
      collections,
    });

    const collectionIds = new Set(
      Object.values(through.mapping.collections).map((collection) => {
        return collection.from.collectionId;
      })
    );
    // Over what the Project holds rather than over what the Mapping names,
    // because a Mapping naming a Collection the Project dropped is reported
    // above rather than skipped here
    for (const collection of collections.filter((one) => {
      return collectionIds.has(one.id);
    })) {
      const collectionId = collection.id;
      const entryReferences = await this.listReferences(
        objectTypeSchema.enum.entry,
        projectId,
        collectionId
      );
      for (const entryReference of entryReferences) {
        const entry = await this.jsonFileService.read(
          this.pathTo.entryFile(projectId, collectionId, entryReference.id),
          entryFileSchema
        );
        issues.push(
          ...entryIssuesOf({
            destinationId: through.destination.id,
            contract: through.contract,
            mapping: through.mapping,
            collection,
            entry,
            languages,
          })
        );
      }
    }

    return issues;
  }

  /** Writes a changed Destination file, stamps `updated` and commits */
  private async write(
    projectId: Uuid,
    destination: DestinationFile
  ): Promise<DestinationFile> {
    const projectPath = this.pathTo.project(projectId);
    const destinationFilePath = this.pathTo.destinationFile(
      projectId,
      destination.id
    );
    const destinationFile: DestinationFile = {
      ...destination,
      updated: datetime(),
    };

    await this.withGitRollback(projectPath, async () => {
      await this.jsonFileService.update(
        destinationFile,
        destinationFilePath,
        destinationFileSchema
      );
      await this.gitService.add(projectPath, [destinationFilePath]);
      await this.gitService.commit(projectPath, {
        method: 'update',
        reference: { objectType: 'destination', id: destination.id },
      });
    });

    return destinationFile;
  }

  /**
   * A Destination with the Contract copy and the Mapping of the version it
   * uses, or of the version that waits beside it.
   *
   * Throws `PreconditionFailed` for the waiting version while none waits,
   * because there is nothing to read it against.
   */
  private async readWithContract(
    projectId: Uuid,
    id: Uuid,
    isWaitingVersion = false
  ): Promise<{
    destination: DestinationFile;
    contract: Contract;
    mapping: Mapping;
  }> {
    const destination = await this.read({ projectId, id });
    const waiting = destination.waiting;
    if (isWaitingVersion && waiting === null) {
      throw CoreError.preconditionFailed(
        `No version of its Contract waits beside the one Destination "${id}" uses`
      );
    }
    const through =
      isWaitingVersion && waiting !== null
        ? { version: waiting.version, mapping: waiting.mapping }
        : {
            version: destination.contract.version,
            mapping: destination.mapping,
          };
    const version = await this.contractService.readVersion({
      projectId,
      id: destination.contract.id,
      version: through.version,
    });
    return {
      destination,
      contract: version.contract,
      mapping: through.mapping,
    };
  }

  /**
   * Throws `Conflict` naming the Destination that already carries the name,
   * because a person picks a website by its own name.
   */
  private async assertNameIsFree(
    projectId: Uuid,
    name: string,
    exceptId?: Uuid
  ): Promise<void> {
    const ids = await this.destinationIds(projectId);
    for (const id of ids) {
      if (id === exceptId) {
        continue;
      }
      const destination = await this.read({ projectId, id }).catch(
        () => undefined
      );
      if (destination?.name === name) {
        throw CoreError.conflict(
          `The name is already in use by Destination "${id}"`
        );
      }
    }
  }

  /** The ids of the destination folders, empty when the Project has none */
  private async destinationIds(projectId: Uuid): Promise<Uuid[]> {
    if ((await Fs.pathExists(this.pathTo.destinations(projectId))) === false) {
      return [];
    }
    const references = await this.listReferences(
      objectTypeSchema.enum.destination,
      projectId
    );
    return references.map(({ id }) => id);
  }

  /** Every Collection of a Project, in folder order */
  private async readCollections(projectId: Uuid): Promise<CollectionFile[]> {
    const references = await this.listReferences(
      objectTypeSchema.enum.collection,
      projectId
    );
    return Promise.all(
      references.map(({ id }) =>
        this.jsonFileService.read(
          this.pathTo.collectionFile(projectId, id),
          collectionFileSchema
        )
      )
    );
  }
}
