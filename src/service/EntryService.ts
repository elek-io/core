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
  type UpdateEntryProps,
  type ValueDefinition,
  type ValueReference,
} from '@elek-io/shared';
import Fs from 'fs-extra';
import RequiredParameterMissingError from '../error/RequiredParameterMissingError.js';
import * as CoreUtil from '../util/index.js';
import AbstractCrudService from './AbstractCrudService.js';
import CollectionService from './CollectionService.js';
import GitService from './GitService.js';
import JsonFileService from './JsonFileService.js';
import ValueService from './ValueService.js';

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
  private valueService: ValueService;

  constructor(
    options: ElekIoCoreOptions,
    jsonFileService: JsonFileService,
    gitService: GitService,
    collectionService: CollectionService,
    valueService: ValueService
  ) {
    super(serviceTypeSchema.Enum.Entry, options);

    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
    this.collectionService = collectionService;
    this.valueService = valueService;
  }

  /**
   * Creates a new Entry
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

    await this.validateValueReferences(
      props.projectId,
      props.collectionId,
      props.valueReferences,
      collection.valueDefinitions
    );

    /**
     * Entry saves references to the Values it's using
     */
    const entryFile: EntryFile = {
      fileType: 'entry',
      id,
      language: props.language,
      valueReferences: props.valueReferences,
      created: currentTimestamp(),
    };

    await this.jsonFileService.create(
      entryFile,
      entryFilePath,
      entryFileSchema
    );
    await this.gitService.add(projectPath, [entryFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.create);

    return entryFile;
  }

  /**
   * Returns an Entry by ID and language
   */
  public async read(props: ReadEntryProps): Promise<Entry> {
    readEntrySchema.parse(props);

    const entryFile = await this.jsonFileService.read(
      CoreUtil.pathTo.entryFile(
        props.projectId,
        props.collectionId,
        props.id,
        props.language
      ),
      entryFileSchema
    );

    return entryFile;
  }

  /**
   * Updates Entry with given ValueReferences
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

    await this.validateValueReferences(
      props.projectId,
      props.collectionId,
      props.valueReferences,
      collection.valueDefinitions
    );

    const prevEntryFile = await this.read({
      projectId: props.projectId,
      collectionId: props.collectionId,
      id: props.id,
      language: props.language,
    });

    const entryFile: EntryFile = {
      ...prevEntryFile,
      valueReferences: props.valueReferences,
      updated: currentTimestamp(),
    };

    await this.jsonFileService.update(
      entryFile,
      entryFilePath,
      entryFileSchema
    );
    await this.gitService.add(projectPath, [entryFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.update);

    return entryFile;
  }

  /**
   * Deletes given Entry
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
   * Checks if given object of Collection, CollectionItem,
   * Field, Project or Asset is of type CollectionItem
   */
  public isEntry(obj: BaseFile | unknown): obj is Entry {
    return entrySchema.safeParse(obj).success;
  }

  /**
   * Validates referenced Values against the Collections definition
   *
   * @todo should probably return all errors occurring during parsing instead of throwing
   */
  private async validateValueReferences(
    projectId: string,
    collectionId: string,
    valueReferences: ValueReference[],
    valueDefinitions: ValueDefinition[]
  ) {
    await Promise.all(
      valueReferences.map(async (reference) => {
        const definition = valueDefinitions.find((def) => {
          if (def.id === reference.definitionId) {
            return true;
          }
          return false;
        });

        if (!definition) {
          throw new Error(
            `No definition with ID "${reference.definitionId}" found in Collection "${collectionId}" for given Value reference`
          );
        }

        const schema = getValueSchemaFromDefinition(definition);
        const value = await this.valueService.read({
          ...reference.references,
          projectId,
        });
        schema.parse(value.content);
      })
    );
  }
}
