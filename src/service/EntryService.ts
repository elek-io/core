import Fs from 'fs-extra';
import {
  countEntriesSchema,
  createEntrySchema,
  deleteEntrySchema,
  entryFileSchema,
  entrySchema,
  getCreateEntrySchemaFromFieldDefinitions,
  getUpdateEntrySchemaFromFieldDefinitions,
  listEntriesSchema,
  objectTypeSchema,
  readEntrySchema,
  serviceTypeSchema,
  updateEntrySchema,
  type BaseFile,
  type CountEntriesProps,
  type CreateEntryProps,
  type CrudServiceWithListCount,
  type DeleteEntryProps,
  type ElekIoCoreOptions,
  type Entry,
  type EntryFile,
  type ListEntriesProps,
  type ReadEntryProps,
  type UpdateEntryProps,
} from '../schema/index.js';
import { pathTo, returnResolved } from '../util/node.js';
import { datetime, uuid } from '../util/shared.js';
import { AbstractCrudService } from './AbstractCrudService.js';
import type { CollectionService } from './CollectionService.js';
import type { GitService } from './GitService.js';
import { JsonFileService } from './JsonFileService.js';
import { LogService } from './LogService.js';

/**
 * Service that manages CRUD functionality for Entry files on disk
 */
export class EntryService
  extends AbstractCrudService
  implements CrudServiceWithListCount<Entry>
{
  private logService: LogService;
  private jsonFileService: JsonFileService;
  private gitService: GitService;
  private collectionService: CollectionService;
  // private sharedValueService: SharedValueService;

  constructor(
    options: ElekIoCoreOptions,
    logService: LogService,
    jsonFileService: JsonFileService,
    gitService: GitService,
    collectionService: CollectionService
    // sharedValueService: SharedValueService
  ) {
    super(serviceTypeSchema.enum.Entry, options);

    this.logService = logService;
    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
    this.collectionService = collectionService;
    // this.sharedValueService = sharedValueService;
  }

  /**
   * Creates a new Entry for given Collection
   */
  public async create(props: CreateEntryProps): Promise<Entry> {
    createEntrySchema.parse(props);

    const id = uuid();
    const projectPath = pathTo.project(props.projectId);
    const entryFilePath = pathTo.entryFile(
      props.projectId,
      props.collectionId,
      id
    );
    const collection = await this.collectionService.read({
      projectId: props.projectId,
      id: props.collectionId,
    });

    const entryFile: EntryFile = {
      objectType: 'entry',
      id,
      values: props.values,
      created: datetime(),
      updated: null,
    };

    const entry = await this.toEntry(
      props.projectId,
      props.collectionId,
      entryFile
    );

    // Validate all Values against their Field Definitions
    const createEntrySchemaFromFieldDefinitions =
      getCreateEntrySchemaFromFieldDefinitions(
        collection.fieldDefinitions,
        entry.values
      );
    createEntrySchemaFromFieldDefinitions.parse(props);

    await this.jsonFileService.create(
      entryFile,
      entryFilePath,
      entryFileSchema
    );
    await this.gitService.add(projectPath, [entryFilePath]);
    await this.gitService.commit(projectPath, {
      method: 'create',
      reference: {
        objectType: 'entry',
        id: entryFile.id,
        collectionId: props.collectionId,
      },
    });

    return entry;
  }

  /**
   * Returns an Entry from given Collection by ID
   *
   * If a commit hash is provided, the Entry is read from history
   */
  public async read(props: ReadEntryProps): Promise<Entry> {
    readEntrySchema.parse(props);

    if (!props.commitHash) {
      const entryFile: EntryFile = await this.jsonFileService.read(
        pathTo.entryFile(props.projectId, props.collectionId, props.id),
        entryFileSchema
      );

      return this.toEntry(props.projectId, props.collectionId, entryFile);
    } else {
      const entryFile = this.migrate(
        JSON.parse(
          await this.gitService.getFileContentAtCommit(
            pathTo.project(props.projectId),
            pathTo.entryFile(props.projectId, props.collectionId, props.id),
            props.commitHash
          )
        )
      );

      return this.toEntry(props.projectId, props.collectionId, entryFile);
    }
  }

  /**
   * Updates an Entry of given Collection with new Values and shared Values
   */
  public async update(props: UpdateEntryProps): Promise<Entry> {
    updateEntrySchema.parse(props);

    const projectPath = pathTo.project(props.projectId);
    const entryFilePath = pathTo.entryFile(
      props.projectId,
      props.collectionId,
      props.id
    );
    const collection = await this.collectionService.read({
      projectId: props.projectId,
      id: props.collectionId,
    });

    const prevEntryFile = await this.read({
      projectId: props.projectId,
      collectionId: props.collectionId,
      id: props.id,
    });

    const entryFile: EntryFile = {
      ...prevEntryFile,
      values: props.values,
      updated: datetime(),
    };

    const entry = await this.toEntry(
      props.projectId,
      props.collectionId,
      entryFile
    );

    // Validate all Values against their Field Definitions
    const updateEntrySchemaFromFieldDefinitions =
      getUpdateEntrySchemaFromFieldDefinitions(
        collection.fieldDefinitions,
        entry.values
      );
    updateEntrySchemaFromFieldDefinitions.parse(props);

    await this.jsonFileService.update(
      entryFile,
      entryFilePath,
      entryFileSchema
    );
    await this.gitService.add(projectPath, [entryFilePath]);
    await this.gitService.commit(projectPath, {
      method: 'update',
      reference: {
        objectType: 'entry',
        id: entryFile.id,
        collectionId: props.collectionId,
      },
    });

    return entry;
  }

  /**
   * Deletes given Entry from it's Collection
   */
  public async delete(props: DeleteEntryProps): Promise<void> {
    deleteEntrySchema.parse(props);

    const projectPath = pathTo.project(props.projectId);
    const entryFilePath = pathTo.entryFile(
      props.projectId,
      props.collectionId,
      props.id
    );

    await Fs.remove(entryFilePath);
    await this.gitService.add(projectPath, [entryFilePath]);
    await this.gitService.commit(projectPath, {
      method: 'delete',
      reference: {
        objectType: 'entry',
        id: props.id,
        collectionId: props.collectionId,
      },
    });
  }

  public async list(props: ListEntriesProps) {
    listEntriesSchema.parse(props);

    const offset = props.offset || 0;
    const limit = props.limit || 15;

    const entryReferences = await this.listReferences(
      objectTypeSchema.enum.entry,
      props.projectId,
      props.collectionId
    );

    const partialEntryReferences = entryReferences.slice(offset, limit);

    const entries = await returnResolved(
      partialEntryReferences.map((reference) => {
        return this.read({
          projectId: props.projectId,
          collectionId: props.collectionId,
          id: reference.id,
        });
      })
    );

    return {
      total: entryReferences.length,
      limit,
      offset,
      list: entries,
    };
  }

  public async count(props: CountEntriesProps): Promise<number> {
    countEntriesSchema.parse(props);

    return (
      await this.listReferences(
        objectTypeSchema.enum.entry,
        props.projectId,
        props.collectionId
      )
    ).length;
  }

  /**
   * Checks if given object is of type Entry
   */
  public isEntry(obj: BaseFile | unknown): obj is Entry {
    return entrySchema.safeParse(obj).success;
  }

  /**
   * Migrates an potentially outdated Entry file to the current schema
   */
  public migrate(potentiallyOutdatedEntryFile: unknown) {
    // @todo

    return entryFileSchema.parse(potentiallyOutdatedEntryFile);
  }

  /**
   * Creates an Entry from given EntryFile by resolving it's Values
   */
  private async toEntry(
    projectId: string,
    collectionId: string,
    entryFile: EntryFile
  ): Promise<Entry> {
    const history = await this.gitService.log(pathTo.project(projectId), {
      filePath: pathTo.entryFile(projectId, collectionId, entryFile.id),
    });

    return {
      ...entryFile,
      history,
    };
  }
}
