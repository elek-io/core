import {
  countValuesSchema,
  createValueSchema,
  currentTimestamp,
  deleteValueSchema,
  fileTypeSchema,
  getValueSchemaFromDefinition,
  listValuesSchema,
  readValueSchema,
  serviceTypeSchema,
  updateValueSchema,
  uuid,
  validateValueSchema,
  valueFileSchema,
  type BaseFile,
  type CountValuesProps,
  type CreateValueProps,
  type DeleteValueProps,
  type ElekIoCoreOptions,
  type ExtendedCrudService,
  type ListValuesProps,
  type PaginatedList,
  type ReadValueProps,
  type UpdateValueProps,
  type ValidateValueProps,
  type Value,
  type ValueFile,
} from '@elek-io/shared';
import Fs from 'fs-extra';
import RequiredParameterMissingError from '../error/RequiredParameterMissingError.js';
import * as CoreUtil from '../util/index.js';
import AbstractCrudService from './AbstractCrudService.js';
import AssetService from './AssetService.js';
import GitService from './GitService.js';
import JsonFileService from './JsonFileService.js';

/**
 * Service that manages CRUD functionality for Value files on disk
 */
export default class ValueService
  extends AbstractCrudService
  implements ExtendedCrudService<Value>
{
  private jsonFileService: JsonFileService;
  private gitService: GitService;

  constructor(
    options: ElekIoCoreOptions,
    jsonFileService: JsonFileService,
    gitService: GitService,
    assetService: AssetService
  ) {
    super(serviceTypeSchema.Enum.Value, options);

    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
  }

  /**
   * Creates a new Value
   */
  public async create(props: CreateValueProps): Promise<Value> {
    createValueSchema.parse(props);

    const id = uuid();
    const projectPath = CoreUtil.pathTo.project(props.projectId);
    const valueFilePath = CoreUtil.pathTo.valueFile(
      props.projectId,
      id,
      props.language
    );

    const valueFile: ValueFile = {
      ...props,
      fileType: 'value',
      id,
      created: currentTimestamp(),
    };

    await this.jsonFileService.create(
      valueFile,
      valueFilePath,
      valueFileSchema
    );
    await this.gitService.add(projectPath, [valueFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.create);

    return valueFile;
  }

  /**
   * Returns a Value by ID and language
   */
  public async read(props: ReadValueProps): Promise<Value> {
    readValueSchema.parse(props);

    const valueFile = await this.jsonFileService.read(
      CoreUtil.pathTo.valueFile(props.projectId, props.id, props.language),
      valueFileSchema
    );

    return valueFile;
  }

  /**
   * Updates given Value
   */
  public async update(props: UpdateValueProps): Promise<Value> {
    updateValueSchema.parse(props);

    const projectPath = CoreUtil.pathTo.project(props.projectId);
    const valueFilePath = CoreUtil.pathTo.valueFile(
      props.projectId,
      props.id,
      props.language
    );
    const prevValueFile = await this.read(props);

    const valueFile: ValueFile = {
      ...prevValueFile,
      ...props,
      updated: currentTimestamp(),
    };

    await this.jsonFileService.update(
      valueFile,
      valueFilePath,
      valueFileSchema
    );
    await this.gitService.add(projectPath, [valueFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.update);

    return valueFile;
  }

  /**
   * Deletes given Value
   */
  public async delete(props: DeleteValueProps): Promise<void> {
    deleteValueSchema.parse(props);

    const projectPath = CoreUtil.pathTo.project(props.projectId);
    const valueFilePath = CoreUtil.pathTo.valueFile(
      props.projectId,
      props.id,
      props.language
    );

    await Fs.remove(valueFilePath);
    await this.gitService.add(projectPath, [valueFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.delete);
  }

  public async list(props: ListValuesProps): Promise<PaginatedList<Value>> {
    listValuesSchema.parse(props);

    const references = await this.listReferences(
      fileTypeSchema.Enum.value,
      props.projectId
    );
    const list = await CoreUtil.returnResolved(
      references.map((reference) => {
        if (!reference.language) {
          throw new RequiredParameterMissingError('language');
        }
        return this.read({
          projectId: props.projectId,
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

  public async count(props: CountValuesProps): Promise<number> {
    countValuesSchema.parse(props);

    const count = (
      await this.listReferences(fileTypeSchema.Enum.value, props.projectId)
    ).length;

    return count;
  }

  /**
   * Checks if given object is of type Value
   */
  public isValue(obj: BaseFile | unknown): obj is Value {
    return valueFileSchema.safeParse(obj).success;
  }

  /**
   * Reads the given Value from disk and validates it against the ValueDefinition
   */
  public async validate(props: ValidateValueProps) {
    validateValueSchema.parse(props);

    const value = await this.read(props);
    const valueSchema = getValueSchemaFromDefinition(props.definition);
    // @todo for isUnique = true we need to iterate through all values of this collection
    // const fieldsOfCollection = await Promise.all(
    //   props.fieldRefsOfCollection.map((fieldRefOfCollection) => {
    //     return this.read({
    //       ...fieldRefOfCollection.field,
    //       projectId: props.projectId,
    //     });
    //   })
    // );

    return valueSchema.safeParse(value.content);
  }
}
