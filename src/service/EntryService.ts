import {
  countEntriesSchema,
  createEntrySchema,
  currentTimestamp,
  deleteEntrySchema,
  entryFileSchema,
  entrySchema,
  fileTypeSchema,
  getValueSchemaFromDefinition,
  listEntriesSchema,
  readEntrySchema,
  serviceTypeSchema,
  updateEntrySchema,
  uuid,
  type BaseFile,
  type CountEntriesProps,
  type CreateEntryProps,
  type DeleteEntryProps,
  type ElekIoCoreOptions,
  type Entry,
  type EntryFile,
  type ExtendedCrudService,
  type ListEntriesProps,
  type ReadEntryProps,
  type ResolvedSharedValueReference,
  type UpdateEntryProps,
  type Value,
  type ValueDefinition,
} from '@elek-io/shared';
import Fs from 'fs-extra';
import RequiredParameterMissingError from '../error/RequiredParameterMissingError.js';
import * as CoreUtil from '../util/index.js';
import AbstractCrudService from './AbstractCrudService.js';
import CollectionService from './CollectionService.js';
import GitService from './GitService.js';
import JsonFileService from './JsonFileService.js';
import SharedValueService from './SharedValueService.js';

/**
 * Service that manages CRUD functionality for Entry files on disk
 */
export default class EntryService
  extends AbstractCrudService
  implements ExtendedCrudService<Entry>
{
  private jsonFileService: JsonFileService;
  private gitService: GitService;
  private collectionService: CollectionService;
  private sharedValueService: SharedValueService;

  constructor(
    options: ElekIoCoreOptions,
    jsonFileService: JsonFileService,
    gitService: GitService,
    collectionService: CollectionService,
    sharedValueService: SharedValueService
  ) {
    super(serviceTypeSchema.Enum.Entry, options);

    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
    this.collectionService = collectionService;
    this.sharedValueService = sharedValueService;
  }

  /**
   * Creates a new Entry for given Collection
   */
  public async create(props: CreateEntryProps): Promise<Entry> {
    createEntrySchema.parse(props);

    const id = uuid();
    const projectPath = CoreUtil.pathTo.project(props.projectId);
    const entryFilePath = CoreUtil.pathTo.entryFile(
      props.projectId,
      props.collectionId,
      id,
      props.language
    );
    const collection = await this.collectionService.read({
      projectId: props.projectId,
      id: props.collectionId,
    });

    const entryFile: EntryFile = {
      fileType: 'entry',
      id,
      language: props.language,
      values: props.values.map((value) => {
        return { ...value, id: uuid() };
      }),
      sharedValues: props.sharedValues,
      created: currentTimestamp(),
    };

    const entry: Entry = await this.toEntry({
      projectId: props.projectId,
      entryFile,
    });

    this.validateValues({
      collectionId: props.collectionId,
      valueDefinitions: collection.valueDefinitions,
      values: entry.values,
    });
    this.validateResolvedSharedValues({
      collectionId: props.collectionId,
      valueDefinitions: collection.valueDefinitions,
      resolvedSharedValues: entry.sharedValues,
    });

    await this.jsonFileService.create(
      entryFile,
      entryFilePath,
      entryFileSchema
    );
    await this.gitService.add(projectPath, [entryFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.create);

    return entry;
  }

  /**
   * Returns an Entry from given Collection by ID and language
   */
  public async read(props: ReadEntryProps): Promise<Entry> {
    readEntrySchema.parse(props);

    const entryFile: EntryFile = await this.jsonFileService.read(
      CoreUtil.pathTo.entryFile(
        props.projectId,
        props.collectionId,
        props.id,
        props.language
      ),
      entryFileSchema
    );

    return await this.toEntry({ projectId: props.projectId, entryFile });
  }

  /**
   * Updates an Entry of given Collection with new Values and shared Values
   */
  public async update(props: UpdateEntryProps): Promise<Entry> {
    updateEntrySchema.parse(props);

    const projectPath = CoreUtil.pathTo.project(props.projectId);
    const entryFilePath = CoreUtil.pathTo.entryFile(
      props.projectId,
      props.collectionId,
      props.id,
      props.language
    );
    const collection = await this.collectionService.read({
      projectId: props.projectId,
      id: props.collectionId,
    });

    const prevEntryFile = await this.read({
      projectId: props.projectId,
      collectionId: props.collectionId,
      id: props.id,
      language: props.language,
    });

    const entryFile: EntryFile = {
      ...prevEntryFile,
      values: props.values,
      sharedValues: props.sharedValues,
      updated: currentTimestamp(),
    };

    const entry: Entry = await this.toEntry({
      projectId: props.projectId,
      entryFile,
    });

    this.validateValues({
      collectionId: props.collectionId,
      valueDefinitions: collection.valueDefinitions,
      values: entry.values,
    });
    this.validateResolvedSharedValues({
      collectionId: props.collectionId,
      valueDefinitions: collection.valueDefinitions,
      resolvedSharedValues: entry.sharedValues,
    });

    await this.jsonFileService.update(
      entryFile,
      entryFilePath,
      entryFileSchema
    );
    await this.gitService.add(projectPath, [entryFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.update);

    return entry;
  }

  /**
   * Deletes given Entry from it's Collection
   */
  public async delete(props: DeleteEntryProps): Promise<void> {
    deleteEntrySchema.parse(props);

    const projectPath = CoreUtil.pathTo.project(props.projectId);
    const entryFilePath = CoreUtil.pathTo.entryFile(
      props.projectId,
      props.collectionId,
      props.id,
      props.language
    );

    await Fs.remove(entryFilePath);
    await this.gitService.add(projectPath, [entryFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.delete);
  }

  public async list(props: ListEntriesProps) {
    listEntriesSchema.parse(props);

    const references = await this.listReferences(
      fileTypeSchema.Enum.entry,
      props.projectId,
      props.collectionId
    );
    const list = await CoreUtil.returnResolved(
      references.map((reference) => {
        if (!reference.language) {
          throw new RequiredParameterMissingError('language');
        }
        return this.read({
          projectId: props.projectId,
          collectionId: props.collectionId,
          id: reference.id,
          language: reference.language,
        });
      })
    );

    return this.paginate(
      list,
      props.sort,
      props.filter,
      props.limit,
      props.offset
    );
  }

  public async count(props: CountEntriesProps): Promise<number> {
    countEntriesSchema.parse(props);

    return (
      await this.listReferences(
        fileTypeSchema.Enum.entry,
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
   * Returns a Value definition by ID
   */
  private getValueDefinitionById(props: {
    valueDefinitions: ValueDefinition[];
    id: string;
    collectionId: string;
  }) {
    const definition = props.valueDefinitions.find((def) => {
      if (def.id === props.id) {
        return true;
      }
      return false;
    });

    if (!definition) {
      throw new Error(
        `No definition with ID "${props.id}" found in Collection "${props.collectionId}" for given Value reference`
      );
    }

    return definition;
  }

  /**
   * Validates given Values against it's Collections definitions
   */
  private validateValues(props: {
    collectionId: string;
    valueDefinitions: ValueDefinition[];
    values: Omit<Value, 'id'>[];
  }) {
    props.values.map((value) => {
      const definition = this.getValueDefinitionById({
        collectionId: props.collectionId,
        valueDefinitions: props.valueDefinitions,
        id: value.definitionId,
      });
      const schema = getValueSchemaFromDefinition(definition);
      schema.parse(value.content);
    });
  }

  /**
   * Validates given shared Value references against it's Collections definitions
   */
  private validateResolvedSharedValues(props: {
    collectionId: string;
    valueDefinitions: ValueDefinition[];
    resolvedSharedValues: ResolvedSharedValueReference[];
  }) {
    props.resolvedSharedValues.map((value) => {
      const definition = this.getValueDefinitionById({
        collectionId: props.collectionId,
        valueDefinitions: props.valueDefinitions,
        id: value.definitionId,
      });
      const schema = getValueSchemaFromDefinition(definition);
      schema.parse(value.resolved.content);
    });
  }

  /**
   * Creates an Entry from given EntryFile by resolving it's shared Values
   */
  private async toEntry(props: {
    projectId: string;
    entryFile: EntryFile;
  }): Promise<Entry> {
    const entry: Entry = {
      ...props.entryFile,
      sharedValues: await Promise.all(
        props.entryFile.sharedValues.map(async (sharedValue) => {
          const resolved = await this.sharedValueService.read({
            ...sharedValue.references,
            projectId: props.projectId,
          });

          return {
            ...sharedValue,
            resolved,
          };
        })
      ),
    };

    return entry;
  }
}
