import Fs from 'fs-extra';
import {
  addWebsiteSchema,
  checkAllDestinationSchema,
  checkDestinationSchema,
  collectionFileSchema,
  countDestinationsSchema,
  deleteDestinationSchema,
  destinationFileSchema,
  entryFileSchema,
  listDestinationsSchema,
  objectTypeSchema,
  readDestinationSchema,
  serviceTypeSchema,
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
  type ListDestinationsProps,
  type PaginatedList,
  type ReadDestinationProps,
  type UpdateDestinationProps,
  type Uuid,
} from '../schema/index.js';
import {
  entryIssuesOf,
  mappingByMatchingIds,
  mappingIssuesOf,
} from '../util/destinationCheck.js';
import type { DestinationIssue } from '../util/destinationIssue.js';
import type { PathTo } from '../util/node.js';
import { CoreError, datetime, uuid } from '../util/shared.js';
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
 * its git address, keeps it in the Project and writes the Destination, and
 * `check()` and `checkAll()` say what the website cannot take.
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
   * Renames a Destination, replaces its Mapping, or both, and commits. What
   * is left out stays as it is, and the version in use never changes here.
   *
   * Throws `PreconditionFailed` in read-only mode and on a provisioned copy,
   * `Conflict` on a name another Destination uses, and `NotFound` for an
   * unknown id.
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

        const projectPath = this.pathTo.project(validatedProps.projectId);
        const destinationFilePath = this.pathTo.destinationFile(
          validatedProps.projectId,
          validatedProps.id
        );
        const destinationFile: DestinationFile = {
          ...previous,
          ...(validatedProps.name === undefined
            ? {}
            : { name: validatedProps.name }),
          ...(validatedProps.mapping === undefined
            ? {}
            : { mapping: validatedProps.mapping }),
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
            reference: { objectType: 'destination', id: validatedProps.id },
          });
        });

        return destinationFile;
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
        const page =
          limit === 0 ? ids.slice(offset) : ids.slice(offset, offset + limit);
        const list = await this.collectResults(
          page.map((id) =>
            this.read({ projectId: validatedProps.projectId, id })
          )
        );
        return {
          total: ids.length,
          limit,
          offset,
          list: list.toSorted((a, b) => b.created.localeCompare(a.created)),
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
   */
  public async check(
    props: CheckDestinationProps
  ): Promise<DestinationIssue[]> {
    return this.validated(
      'check',
      checkDestinationSchema,
      props,
      async (validatedProps) => {
        const { destination, contract } = await this.readWithContract(
          validatedProps.projectId,
          validatedProps.id
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
            mapping: destination.mapping,
            collections: await this.readCollections(validatedProps.projectId),
          }),
          ...entryIssuesOf({
            destinationId: destination.id,
            contract,
            mapping: destination.mapping,
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
   */
  public async checkAll(
    props: CheckAllDestinationProps
  ): Promise<DestinationIssue[]> {
    return this.validated(
      'checkAll',
      checkAllDestinationSchema,
      props,
      async (validatedProps) => {
        const { destination, contract } = await this.readWithContract(
          validatedProps.projectId,
          validatedProps.id
        );
        const languages = await this.readProjectLanguages(
          validatedProps.projectId
        );
        const collections = await this.readCollections(
          validatedProps.projectId
        );
        const issues: DestinationIssue[] = mappingIssuesOf({
          destinationId: destination.id,
          contract,
          mapping: destination.mapping,
          collections,
        });

        const collectionIds = new Set(
          Object.values(destination.mapping.collections).map((collection) => {
            return collection.from.collectionId;
          })
        );
        // Over what the Project holds rather than over what the Mapping
        // names, because a Mapping naming a Collection the Project dropped is
        // reported above rather than skipped here
        for (const collection of collections.filter((one) => {
          return collectionIds.has(one.id);
        })) {
          const collectionId = collection.id;
          const entryReferences = await this.listReferences(
            objectTypeSchema.enum.entry,
            validatedProps.projectId,
            collectionId
          );
          for (const entryReference of entryReferences) {
            const entry = await this.jsonFileService.read(
              this.pathTo.entryFile(
                validatedProps.projectId,
                collectionId,
                entryReference.id
              ),
              entryFileSchema
            );
            issues.push(
              ...entryIssuesOf({
                destinationId: destination.id,
                contract,
                mapping: destination.mapping,
                collection,
                entry,
                languages,
              })
            );
          }
        }

        return issues;
      }
    );
  }

  /** A Destination with the Contract copy of the version it uses */
  private async readWithContract(
    projectId: Uuid,
    id: Uuid
  ): Promise<{ destination: DestinationFile; contract: Contract }> {
    const destination = await this.read({ projectId, id });
    const version = await this.contractService.readVersion({
      projectId,
      id: destination.contract.id,
      version: destination.contract.version,
    });
    return { destination, contract: version.contract };
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
