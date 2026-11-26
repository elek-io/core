import Fs from 'fs-extra';
import { isDeepStrictEqual } from 'node:util';
import {
  addWebsiteSchema,
  checkAllDestinationSchema,
  checkDestinationSchema,
  checkMappingSchema,
  collectionFileSchema,
  countDestinationsSchema,
  createContractFieldSchema,
  createdCollectionsSchema,
  createFromContractSchema,
  deleteDestinationSchema,
  destinationFileSchema,
  destinationValuesSchema,
  entryFileSchema,
  flattenFieldDefinitions,
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
  type CheckMappingProps,
  type Collection,
  type CollectionFile,
  type CollectionMapping,
  type Contract,
  type CountDestinationsProps,
  type CreateContractFieldProps,
  type CreatedCollectionsProps,
  type CreateFromContractProps,
  type DeleteDestinationProps,
  type DestinationFile,
  type DestinationValuesProps,
  type ElekIoCoreOptions,
  type EntryFile,
  type FieldDefinition,
  type FieldDefinitionOrGroup,
  type KeepDestinationVersionProps,
  type ListDestinationsProps,
  type Mapping,
  type NewerDestinationVersionsProps,
  type PaginatedList,
  type ReadDestinationProps,
  type SwitchDestinationVersionProps,
  type UpdateDestinationProps,
  type Uuid,
  type Value,
} from '../schema/index.js';
import {
  contractComponentsNeeded,
  fieldDefinitionsFromContract,
  unfilledMessage,
} from '../util/contractCreate.js';
import {
  conditionsBySource,
  contractValuesOf,
  entryIssuesOf,
  mappingByMatchingIds,
  mappingForVersion,
  mappingIssuesOf,
  takesEntry,
} from '../util/destinationCheck.js';
import type {
  DestinationIssue,
  DestinationMappingIssue,
} from '../util/destinationIssue.js';
import type {
  KeptVersion,
  SwitchedVersion,
} from '../util/destinationVersion.js';
import type { PathTo } from '../util/node.js';
import { CoreError, datetime, uuid } from '../util/shared.js';
import { isNewerVersion } from '../util/theme.js';
import { AbstractEntityService } from './AbstractEntityService.js';
import type { CacheService } from './CacheService.js';
import type { CollectionService } from './CollectionService.js';
import type { ComponentService } from './ComponentService.js';
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
  private collectionService: CollectionService;
  private componentService: ComponentService;

  public constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    gitService: GitService,
    jsonFileService: JsonFileService,
    cacheService: CacheService,
    contractService: ContractService,
    collectionService: CollectionService,
    componentService: ComponentService
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
    this.collectionService = collectionService;
    this.componentService = componentService;
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
          createdFromTheme: { collectionIds: [], componentIds: [] },
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
   * another Destination uses, `NotFound` for an unknown id, and `BadRequest`
   * for a Mapping filling a Collection its Contract does not hold. Whatever
   * a Mapping leaves unfilled is saved, so an editor maps in steps, and
   * `checkMapping()` says what is left.
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
        if (validatedProps.mapping !== undefined) {
          await this.assertMappingIsOfContract(
            validatedProps.projectId,
            previous,
            validatedProps.mapping,
            false
          );
        }
        if (validatedProps.waitingMapping !== undefined) {
          await this.assertMappingIsOfContract(
            validatedProps.projectId,
            previous,
            validatedProps.waitingMapping,
            true
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
   * the Contract, and one the website does not take, raise no issue of their
   * own, and the Mapping's issues still come back. It reads every Collection
   * of the Project, and the Entries this one points at.
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

        const collections = await this.readCollections(
          validatedProps.projectId
        );
        const languages = await this.readProjectLanguages(
          validatedProps.projectId
        );

        return [
          ...mappingIssuesOf({
            destinationId: destination.id,
            contract,
            mapping,
            collections,
            languages,
          }),
          ...entryIssuesOf({
            destinationId: destination.id,
            contract,
            mapping,
            collection,
            entry,
            languages,
            entryIdsNotTaken: await this.entryIdsNotTaken({
              projectId: validatedProps.projectId,
              mapping,
              collections,
              among: entryReferencesOf(entry),
            }),
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
   * costs one read per Entry. An Entry the website does not take is left
   * out, which is what makes a condition worth setting.
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
   * one already waiting is built again. Both keep what was mapped and fill what
   * the Project carries by id. Throws `PreconditionFailed` for an older version
   * and `BadRequest` for one the theme or the Project's copy names differently.
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
        // The Contract a switch would put the website on, resolved before the
        // name is checked and before anything is written. A copy is never
        // rewritten, so a version the Project already holds a copy of keeps
        // that Contract whatever the theme answers at its tag now, and only a
        // version no copy exists for takes what the theme just answered.
        // Which versions the Project holds is read again here rather than
        // taken from the read above, because reading the theme takes long
        // enough for another call's copy of this version to land in between
        const held = await this.contractService.read({
          projectId: validatedProps.projectId,
          id: destination.contract.id,
        });
        const hasCopy = held.versions.includes(theme.version);
        const copy = hasCopy
          ? (
              await this.contractService.readVersion({
                projectId: validatedProps.projectId,
                id: destination.contract.id,
                version: theme.version,
              })
            ).contract
          : theme.contract;
        if (copy.name !== inUse.contract.name) {
          throw CoreError.badRequest(
            hasCopy
              ? `The Project's own copy of version "${theme.version}" carries the Contract "${copy.name}" while Destination "${destination.id}" follows "${inUse.contract.name}". A copy is never rewritten, so keep a version the Project holds no copy of, or add a website for the other Contract.`
              : `Version "${theme.version}" of the theme carries the Contract "${copy.name}" while Destination "${destination.id}" follows "${inUse.contract.name}". Keep the name the Contract had, or add a website for the other theme.`
          );
        }

        if (hasCopy === false) {
          await this.contractService.keep({
            projectId: validatedProps.projectId,
            origin: kept.origin,
            contract: theme.contract,
            commit: theme.commit,
          });
        }
        const carryFrom =
          destination.waiting === null
            ? [destination.mapping]
            : [destination.waiting.mapping, destination.mapping];
        const waiting = {
          version: theme.version,
          mapping: mappingForVersion({
            contract: copy,
            collections: await this.readCollections(validatedProps.projectId),
            carryFrom,
          }),
        };
        // The Mapping of a version that already waits is built again, so a
        // field definition the Project gained under an id the Contract
        // carries fills what the run before left unmapped. Nothing is
        // written while it fills the same
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
   * What a Mapping the Project has not saved yet leaves the Contract
   * without, so an app checks the Mapping an editor is building before it
   * saves it. No Entry is read.
   *
   * Empty when the Mapping fills every Collection and required field of the
   * Contract from something that fits. Throws `BadRequest` for a Mapping
   * filling a Collection the Contract does not hold, and
   * `PreconditionFailed` for `isWaitingVersion` while no version waits.
   *
   * @see ../../docs/destinations.md
   */
  public async checkMapping(
    props: CheckMappingProps
  ): Promise<DestinationMappingIssue[]> {
    return this.validated(
      'checkMapping',
      checkMappingSchema,
      props,
      async (validatedProps) => {
        const { destination, contract } = await this.readWithContract(
          validatedProps.projectId,
          validatedProps.id,
          validatedProps.isWaitingVersion
        );
        await this.assertMappingIsOfContract(
          validatedProps.projectId,
          destination,
          validatedProps.mapping,
          validatedProps.isWaitingVersion === true
        );

        return mappingIssuesOf({
          destinationId: destination.id,
          contract,
          mapping: validatedProps.mapping,
          collections: await this.readCollections(validatedProps.projectId),
          languages: await this.readProjectLanguages(validatedProps.projectId),
        });
      }
    );
  }

  /**
   * The Values one Entry of the Project gives one Collection of the
   * Contract, keyed by its own field slugs, which is what a site reads.
   *
   * Every way of filling a field is applied, so a fixed Value, joined
   * fields, matched options and a language order read as they do in a
   * build, whether or not the website takes the Entry. Throws `NotFound`
   * for a Collection or Entry that is not there and `PreconditionFailed`
   * for one nothing fills.
   *
   * @see ../../docs/destinations.md
   */
  public async values(
    props: DestinationValuesProps
  ): Promise<Record<string, Value>> {
    return this.validated(
      'values',
      destinationValuesSchema,
      props,
      async (validatedProps) => {
        const { contract, mapping } = await this.readWithContract(
          validatedProps.projectId,
          validatedProps.id,
          validatedProps.isWaitingVersion
        );
        const contractCollection = contractCollectionOf(
          contract,
          validatedProps.contractCollectionId
        );
        const collectionMapping = mapping.collections[contractCollection.id];
        if (collectionMapping === undefined) {
          throw CoreError.preconditionFailed(
            `No Collection of the Project fills "${contractCollection.slug.plural}" of the Contract, so there is no Entry to read it from`
          );
        }
        const collection = await this.jsonFileService.read(
          this.pathTo.collectionFile(
            validatedProps.projectId,
            collectionMapping.from.collectionId
          ),
          collectionFileSchema
        );
        const entry = await this.jsonFileService.read(
          this.pathTo.entryFile(
            validatedProps.projectId,
            collection.id,
            validatedProps.entryId
          ),
          entryFileSchema
        );

        return contractValuesOf({
          contract,
          mapping,
          contractCollectionId: contractCollection.id,
          collection,
          entry,
          languages: await this.readProjectLanguages(validatedProps.projectId),
        });
      }
    );
  }

  /**
   * The Collections this website created from its theme, in the order they
   * were created, so an app shows them under the website they belong to.
   *
   * A Collection deleted since is left out rather than reported, because a
   * Collection the Project no longer holds is one the Mapping no longer
   * fills anything from, which the check reports.
   */
  public async createdCollections(
    props: CreatedCollectionsProps
  ): Promise<Collection[]> {
    return this.validated(
      'createdCollections',
      createdCollectionsSchema,
      props,
      async (validatedProps) => {
        const destination = await this.read(validatedProps);
        const created: Collection[] = [];
        for (const id of destination.createdFromTheme.collectionIds) {
          const collection = await this.collectionService
            .read({ projectId: validatedProps.projectId, id })
            .catch(notFoundAsUndefined);
          if (collection !== undefined) {
            created.push(collection);
          }
        }
        return created;
      }
    );
  }

  /**
   * Creates the Collection one Collection of the Contract needs from the
   * theme, with the Components it needs, fills the Mapping with it and
   * commits. Every id is the Project's own.
   *
   * Throws `Conflict` for a Collection of the Project under that slug, a
   * Component under one of the theme's and a Collection of the Contract
   * something already fills, and `PreconditionFailed` for a Collection its
   * fields point at that nothing fills. Nothing is written then.
   *
   * @see ../../docs/destinations.md
   */
  public async createCollection(
    props: CreateFromContractProps
  ): Promise<DestinationFile> {
    this.assertNotReadOnly('createCollection');
    const { projectId } = this.parseOrThrow(
      'createCollection',
      createFromContractSchema.pick({ projectId: true }),
      props
    );
    await this.assertNotProvisioned('createCollection', projectId);

    return this.mutating(
      'createCollection',
      createFromContractSchema,
      props,
      async (validatedProps) => {
        const { destination, contract, mapping } = await this.readWithContract(
          validatedProps.projectId,
          validatedProps.id,
          validatedProps.isWaitingVersion
        );
        const contractCollection = contractCollectionOf(
          contract,
          validatedProps.contractCollectionId
        );
        const named = `"${contractCollection.slug.plural}" of the Contract`;
        const filled = mapping.collections[contractCollection.id];
        if (filled !== undefined) {
          throw CoreError.conflict(
            `The Collection ${named} is filled from the Collection "${filled.from.collectionId}" of the Project. Replace the Mapping to fill it from another one.`
          );
        }
        const clashing = await this.collectionService
          .resolveCollectionId({
            projectId: validatedProps.projectId,
            idOrSlug: contractCollection.slug.plural,
          })
          .catch(notFoundAsUndefined);
        if (clashing !== undefined) {
          throw CoreError.conflict(
            `The Project holds the Collection "${clashing}" under the slug "${contractCollection.slug.plural}" already. Fill ${named} from it, or rename one of the two.`
          );
        }
        const collectionIds = sourceCollectionIds(mapping);
        const componentIds = await this.componentsFromContract({
          projectId: validatedProps.projectId,
          destination,
          contract,
          fieldDefinitions: contractCollection.fieldDefinitions,
          collectionIds,
        });
        const fields = fieldDefinitionsFromContract({
          fieldDefinitions: contractCollection.fieldDefinitions,
          collectionIds,
          componentIds: componentIds.of,
        });
        // A field pointing at the Collection being created is filled by it
        // the moment it exists, which is the one reference the Mapping
        // cannot answer for beforehand
        const unfilled = fields.unfilled.filter((one) => {
          return (
            one.objectType !== 'collection' || one.id !== contractCollection.id
          );
        });
        if (unfilled.length > 0) {
          throw CoreError.preconditionFailed(
            `The Collection ${named} points at ${unfilledMessage(unfilled)}. Fill it, or create it from the theme, and create this one after it.`
          );
        }

        const created = await this.collectionService.create({
          projectId: validatedProps.projectId,
          name: contractCollection.name,
          slug: contractCollection.slug,
          description: contractCollection.description,
          icon: contractCollection.icon,
          isSingleEntry: contractCollection.isSingleEntry,
          fieldDefinitions: fields.fieldDefinitions,
        });
        const itself = selfReferencingIds(
          contractCollection,
          fields.fieldDefinitionIds
        );
        if (itself.size > 0) {
          await this.collectionService.update({
            ...created,
            projectId: validatedProps.projectId,
            fieldDefinitions: withSelfReferences(
              created.fieldDefinitions,
              itself,
              created.id
            ),
          });
        }

        return this.writeWithMapping({
          projectId: validatedProps.projectId,
          destination,
          isWaitingVersion: validatedProps.isWaitingVersion === true,
          mapping: {
            collections: {
              ...mapping.collections,
              [contractCollection.id]: {
                from: { collectionId: created.id, where: [] },
                fields: Object.fromEntries(
                  [...fields.fieldDefinitionIds].map(([contractId, own]) => [
                    contractId,
                    { fill: 'field' as const, fieldDefinitionId: own },
                  ])
                ),
              },
            },
          },
          createdFromTheme: {
            collectionIds: [
              ...destination.createdFromTheme.collectionIds,
              created.id,
            ],
            componentIds: [
              ...destination.createdFromTheme.componentIds,
              ...componentIds.created,
            ],
          },
        });
      }
    );
  }

  /**
   * Adds the field definition one field of the Contract needs to the
   * Collection of the Project filling it, fills the Mapping with it and
   * commits. Its id is the Project's own and its slug the theme's.
   *
   * Throws `PreconditionFailed` while nothing fills that Collection of the
   * Contract, `Conflict` for a field something already fills or a field
   * definition under that slug, and whatever a field definition change
   * throws until `resolutions` carries the Value of a required field.
   *
   * @see ../../docs/destinations.md
   */
  public async createFieldDefinition(
    props: CreateContractFieldProps
  ): Promise<DestinationFile> {
    this.assertNotReadOnly('createFieldDefinition');
    const { projectId } = this.parseOrThrow(
      'createFieldDefinition',
      createContractFieldSchema.pick({ projectId: true }),
      props
    );
    await this.assertNotProvisioned('createFieldDefinition', projectId);

    return this.mutating(
      'createFieldDefinition',
      createContractFieldSchema,
      props,
      async (validatedProps) => {
        const { destination, contract, mapping } = await this.readWithContract(
          validatedProps.projectId,
          validatedProps.id,
          validatedProps.isWaitingVersion
        );
        const contractCollection = contractCollectionOf(
          contract,
          validatedProps.contractCollectionId
        );
        const contractField = flattenFieldDefinitions(
          contractCollection.fieldDefinitions
        ).find(({ id }) => id === validatedProps.contractFieldDefinitionId);
        if (contractField === undefined) {
          throw CoreError.notFound(
            `The Collection "${contractCollection.slug.plural}" of the Contract has no field "${validatedProps.contractFieldDefinitionId}"`
          );
        }
        const named = `"${contractField.slug}" of "${contractCollection.slug.plural}"`;
        const collectionMapping = mapping.collections[contractCollection.id];
        if (collectionMapping === undefined) {
          throw CoreError.preconditionFailed(
            `No Collection of the Project fills "${contractCollection.slug.plural}" of the Contract, so there is nothing to add the field ${named} to. Fill it, or create it from the theme.`
          );
        }
        const filled = collectionMapping.fields[contractField.id];
        if (filled !== undefined) {
          throw CoreError.conflict(
            `The field ${named} is filled already. Replace the Mapping to fill it from another field.`
          );
        }
        const collection = await this.collectionService.read({
          projectId: validatedProps.projectId,
          id: collectionMapping.from.collectionId,
        });
        const clashing = flattenFieldDefinitions(
          collection.fieldDefinitions
        ).find(({ slug }) => slug === contractField.slug);
        if (clashing !== undefined) {
          throw CoreError.conflict(
            `The Collection "${collection.slug.plural}" of the Project holds the field "${clashing.slug}" already. Fill the field ${named} from it, or rename one of the two.`
          );
        }
        const collectionIds = sourceCollectionIds(mapping);
        const componentIds = await this.componentsFromContract({
          projectId: validatedProps.projectId,
          destination,
          contract,
          fieldDefinitions: [contractField],
          collectionIds,
        });
        const fields = fieldDefinitionsFromContract({
          fieldDefinitions: [contractField],
          collectionIds,
          componentIds: componentIds.of,
          fieldDefinitionIds: sourceFieldDefinitionIds(collectionMapping),
        });
        if (fields.unfilled.length > 0) {
          throw CoreError.preconditionFailed(
            `The field ${named} points at ${unfilledMessage(fields.unfilled)}. Fill it, or create it from the theme, and create this field after it.`
          );
        }
        const own = fields.fieldDefinitionIds.get(contractField.id);
        if (own === undefined) {
          throw CoreError.internal(
            `The field ${named} was not created, so the Mapping was left as it is`
          );
        }

        await this.collectionService.update({
          ...collection,
          projectId: validatedProps.projectId,
          fieldDefinitions: [
            ...collection.fieldDefinitions,
            ...fields.fieldDefinitions,
          ],
          ...(validatedProps.resolutions === undefined
            ? {}
            : { resolutions: validatedProps.resolutions }),
        });

        return this.writeWithMapping({
          projectId: validatedProps.projectId,
          destination,
          isWaitingVersion: validatedProps.isWaitingVersion === true,
          mapping: {
            collections: {
              ...mapping.collections,
              [contractCollection.id]: {
                ...collectionMapping,
                fields: {
                  ...collectionMapping.fields,
                  [contractField.id]: {
                    fill: 'field',
                    fieldDefinitionId: own,
                  },
                },
              },
            },
          },
          createdFromTheme: {
            collectionIds: destination.createdFromTheme.collectionIds,
            componentIds: [
              ...destination.createdFromTheme.componentIds,
              ...componentIds.created,
            ],
          },
        });
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
      languages,
    });
    const entryIdsNotTaken = await this.entryIdsNotTaken({
      projectId,
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
            entryIdsNotTaken,
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

  /**
   * The Entries of the Project the website does not take, by id, among the
   * ones named or every Entry of the Collections it takes a part of.
   *
   * Only a Collection every entry of the Mapping reads through a condition
   * is read, because one read without a condition takes all of its Entries.
   * An Entry that is gone is left out, which a reference pointing at it is
   * reported for elsewhere.
   */
  private async entryIdsNotTaken(props: {
    projectId: Uuid;
    mapping: Mapping;
    collections: readonly CollectionFile[];
    among?: ReadonlyArray<{ collectionId: Uuid; id: Uuid }>;
  }): Promise<Set<Uuid>> {
    const conditions = conditionsBySource(props.mapping);
    const notTaken = new Set<Uuid>();
    for (const collection of props.collections) {
      const lists = conditions.get(collection.id);
      if (lists === undefined) {
        continue;
      }
      const ids =
        props.among === undefined
          ? (
              await this.listReferences(
                objectTypeSchema.enum.entry,
                props.projectId,
                collection.id
              )
            ).map(({ id }) => id)
          : props.among
              .filter((one) => one.collectionId === collection.id)
              .map(({ id }) => id);
      for (const id of ids) {
        const entry = await this.jsonFileService
          .read(
            this.pathTo.entryFile(props.projectId, collection.id, id),
            entryFileSchema
          )
          .catch(notFoundAsUndefined);
        if (entry === undefined) {
          continue;
        }
        const isTaken = lists.some((where) => {
          return takesEntry({ where, collection, entry });
        });
        if (isTaken === false) {
          notTaken.add(entry.id);
        }
      }
    }
    return notTaken;
  }

  /**
   * Throws `BadRequest` naming the first Collection a Mapping fills that the
   * Contract does not hold, because such an entry fills nothing and no check
   * reads it. What the Contract holds and the Mapping leaves out is saved as
   * it is, so an editor maps in steps.
   */
  private async assertMappingIsOfContract(
    projectId: Uuid,
    destination: DestinationFile,
    mapping: Mapping,
    isWaitingVersion: boolean
  ): Promise<void> {
    const version = isWaitingVersion
      ? destination.waiting?.version
      : destination.contract.version;
    if (version === undefined) {
      return;
    }
    const kept = await this.contractService.readVersion({
      projectId,
      id: destination.contract.id,
      version,
    });
    const held = new Set(kept.contract.collections.map(({ id }) => id));
    const unknown = Object.keys(mapping.collections).find((id) => {
      return held.has(id) === false;
    });
    if (unknown !== undefined) {
      throw CoreError.badRequest(
        `The Mapping fills the Collection "${unknown}", which the Contract "${kept.contract.name}" at version ${version} does not hold. Key every Collection of a Mapping by the Contract's own Collection id.`
      );
    }
  }

  /**
   * The Components of the Project the Contract's Components became, creating
   * every one these field definitions need and the Project does not hold
   * yet, dependencies first.
   *
   * A Component this website created from its theme before is reused, so
   * creating a second Collection needing it works. One the Project holds
   * under the same slug and this website did not create throws `Conflict`,
   * because a theme's Component and an editor's own under one slug are two
   * different sets of fields.
   */
  private async componentsFromContract(props: {
    projectId: Uuid;
    destination: DestinationFile;
    contract: Contract;
    fieldDefinitions: readonly FieldDefinitionOrGroup[];
    collectionIds: ReadonlyMap<Uuid, Uuid>;
  }): Promise<{ of: Map<Uuid, Uuid>; created: Uuid[] }> {
    const needed = contractComponentsNeeded({
      fieldDefinitions: props.fieldDefinitions,
      contract: props.contract,
    });
    if (needed.unfilled.length > 0) {
      throw CoreError.badRequest(
        `The Contract "${props.contract.name}" at version ${props.contract.version} names ${unfilledMessage(needed.unfilled)}, so nothing can be created from it`
      );
    }
    const of = new Map<Uuid, Uuid>();
    const created: Uuid[] = [];
    for (const component of needed.components) {
      const held = await this.componentService
        .resolveComponentId({
          projectId: props.projectId,
          idOrSlug: component.slug,
        })
        .catch(notFoundAsUndefined);
      if (held !== undefined) {
        if (
          props.destination.createdFromTheme.componentIds.includes(held) ===
          false
        ) {
          throw CoreError.conflict(
            `The Project holds the Component "${held}" under the slug "${component.slug}" already, and this website did not create it from its theme. Rename one of the two.`
          );
        }
        of.set(component.id, held);
        continue;
      }
      const fields = fieldDefinitionsFromContract({
        fieldDefinitions: component.fieldDefinitions,
        collectionIds: props.collectionIds,
        componentIds: of,
      });
      if (fields.unfilled.length > 0) {
        throw CoreError.preconditionFailed(
          `The Component "${component.slug}" of the Contract points at ${unfilledMessage(fields.unfilled)}. Fill it, or create it from the theme, first.`
        );
      }
      const own = await this.componentService.create({
        projectId: props.projectId,
        name: component.name,
        slug: component.slug,
        description: component.description,
        fieldDefinitions: fields.fieldDefinitions.flatMap((fieldOrGroup) => {
          return 'isGroup' in fieldOrGroup ? [] : [fieldOrGroup];
        }),
      });
      of.set(component.id, own.id);
      created.push(own.id);
    }
    return { of, created };
  }

  /**
   * Writes a Destination with the Mapping of the version in use or of the
   * one that waits replaced, and what it created from its theme where that
   * grew, and commits.
   */
  private async writeWithMapping(props: {
    projectId: Uuid;
    destination: DestinationFile;
    mapping: Mapping;
    isWaitingVersion: boolean;
    createdFromTheme?: DestinationFile['createdFromTheme'];
  }): Promise<DestinationFile> {
    const waiting = props.destination.waiting;
    return this.write(props.projectId, {
      ...props.destination,
      ...(props.isWaitingVersion && waiting !== null
        ? { waiting: { ...waiting, mapping: props.mapping } }
        : { mapping: props.mapping }),
      ...(props.createdFromTheme === undefined
        ? {}
        : { createdFromTheme: props.createdFromTheme }),
    });
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

/**
 * The Collection of a Contract by its id. Throws `NotFound`, because a
 * Collection of the Contract nothing names is one no Mapping, Value or
 * create can be about.
 */
function contractCollectionOf(contract: Contract, id: Uuid): CollectionFile {
  const collection = contract.collections.find((candidate) => {
    return candidate.id === id;
  });
  if (collection === undefined) {
    throw CoreError.notFound(
      `The Contract "${contract.name}" at version ${contract.version} has no Collection "${id}"`
    );
  }
  return collection;
}

/** Which Collection of the Project fills each one of the Contract */
function sourceCollectionIds(mapping: Mapping): Map<Uuid, Uuid> {
  return new Map(
    Object.entries(mapping.collections).map(
      ([contractId, collectionMapping]) => {
        return [contractId, collectionMapping.from.collectionId];
      }
    )
  );
}

/**
 * Which field definition of the Project fills each field of the Contract,
 * for the Collection one entry of the Mapping is about. Only a field filled
 * from one field definition of its own is in there, because nothing else is
 * a field a created one could point at.
 */
function sourceFieldDefinitionIds(
  collectionMapping: CollectionMapping
): Map<Uuid, Uuid> {
  const ids = new Map<Uuid, Uuid>();
  for (const [contractId, fieldMapping] of Object.entries(
    collectionMapping.fields
  )) {
    if (fieldMapping.fill === 'field') {
      ids.set(contractId, fieldMapping.fieldDefinitionId);
    }
  }
  return ids;
}

/**
 * The field definitions of the Project, by id, whose Collection of the
 * Contract points at itself, which is the one reference a create can only
 * fill once the Collection exists.
 */
function selfReferencingIds(
  contractCollection: CollectionFile,
  fieldDefinitionIds: ReadonlyMap<Uuid, Uuid>
): Set<Uuid> {
  const ids = new Set<Uuid>();
  for (const field of flattenFieldDefinitions(
    contractCollection.fieldDefinitions
  )) {
    if (
      'ofCollections' in field &&
      field.ofCollections.includes(contractCollection.id)
    ) {
      const own = fieldDefinitionIds.get(field.id);
      if (own !== undefined) {
        ids.add(own);
      }
    }
  }
  return ids;
}

/**
 * The field definitions with the Collection added to the `ofCollections` of
 * every one of `ids`, which is how a Collection created from the theme comes
 * to point at itself.
 */
function withSelfReferences(
  fieldDefinitions: readonly FieldDefinitionOrGroup[],
  ids: ReadonlySet<Uuid>,
  collectionId: Uuid
): FieldDefinitionOrGroup[] {
  const one = (field: FieldDefinition): FieldDefinition => {
    if (ids.has(field.id) === false) {
      return field;
    }
    if (field.fieldType === 'entry' || field.fieldType === 'markdown') {
      return {
        ...field,
        ofCollections: [...field.ofCollections, collectionId],
      };
    }
    return field;
  };
  return fieldDefinitions.map((fieldOrGroup) => {
    return 'isGroup' in fieldOrGroup
      ? {
          ...fieldOrGroup,
          fieldDefinitions: fieldOrGroup.fieldDefinitions.map(one),
        }
      : one(fieldOrGroup);
  });
}

/** Every Entry of the Project one Entry's Values point at */
function entryReferencesOf(
  entry: EntryFile
): Array<{ collectionId: Uuid; id: Uuid }> {
  const references: Array<{ collectionId: Uuid; id: Uuid }> = [];
  for (const value of Object.values(entry.values)) {
    if (value.valueType !== 'reference') {
      continue;
    }
    for (const entries of Object.values(value.content)) {
      for (const reference of entries ?? []) {
        if (reference.objectType === 'entry') {
          references.push({
            collectionId: reference.collectionId,
            id: reference.id,
          });
        }
      }
    }
  }
  return references;
}

/**
 * Undefined for a `NotFound`, so a read of something that may be gone reads
 * as absent rather than failing. Anything else is thrown on.
 */
function notFoundAsUndefined(error: unknown): undefined {
  if (error instanceof CoreError && error.type === 'NotFound') {
    return undefined;
  }
  throw error;
}
