import {
  ValueTypeSchema,
  countValuesSchema,
  createSharedValueSchema,
  currentTimestamp,
  deleteSharedValueSchema,
  fileTypeSchema,
  listSharedValuesSchema,
  readSharedValueSchema,
  serviceTypeSchema,
  sharedValueFileSchema,
  sharedValueSchema,
  updateSharedValueSchema,
  uuid,
  z,
  type BaseFile,
  type CountValuesProps,
  type CreateSharedValueProps,
  type DeleteSharedValueProps,
  type ElekIoCoreOptions,
  type ExtendedCrudService,
  type ListSharedValuesProps,
  type PaginatedList,
  type ReadSharedValueProps,
  type SharedValue,
  type SharedValueFile,
  type UpdateSharedValueProps,
} from '@elek-io/shared';
import Fs from 'fs-extra';
import RequiredParameterMissingError from '../error/RequiredParameterMissingError.js';
import * as CoreUtil from '../util/index.js';
import AbstractCrudService from './AbstractCrudService.js';
import AssetService from './AssetService.js';
import GitService from './GitService.js';
import JsonFileService from './JsonFileService.js';

/**
 * Service that manages CRUD functionality for shared Value files on disk
 */
export default class SharedValueService
  extends AbstractCrudService
  implements ExtendedCrudService<SharedValue>
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
   * Creates a new shared Value
   */
  public async create(props: CreateSharedValueProps): Promise<SharedValue> {
    createSharedValueSchema.parse(props);

    const id = uuid();
    const projectPath = CoreUtil.pathTo.project(props.projectId);
    const sharedValueFilePath = CoreUtil.pathTo.sharedValueFile(
      props.projectId,
      id,
      props.language
    );

    const sharedValueFile: SharedValueFile = {
      ...props,
      fileType: 'sharedValue',
      id,
      created: currentTimestamp(),
    };

    this.validate(sharedValueFile);

    await this.jsonFileService.create(
      sharedValueFile,
      sharedValueFilePath,
      sharedValueFileSchema
    );
    await this.gitService.add(projectPath, [sharedValueFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.create);

    return sharedValueFile;
  }

  /**
   * Returns a shared Value by ID and language
   */
  public async read(props: ReadSharedValueProps): Promise<SharedValue> {
    readSharedValueSchema.parse(props);

    const sharedValueFile = await this.jsonFileService.read(
      CoreUtil.pathTo.sharedValueFile(
        props.projectId,
        props.id,
        props.language
      ),
      sharedValueFileSchema
    );

    return sharedValueFile;
  }

  /**
   * Updates given shared Values content
   *
   * The valueType cannot be changed after creating the shared Value
   */
  public async update(props: UpdateSharedValueProps): Promise<SharedValue> {
    updateSharedValueSchema.parse(props);

    const projectPath = CoreUtil.pathTo.project(props.projectId);
    const sharedValueFilePath = CoreUtil.pathTo.sharedValueFile(
      props.projectId,
      props.id,
      props.language
    );
    const prevSharedValueFile = await this.read(props);

    const sharedValueFile: SharedValueFile = {
      ...prevSharedValueFile,
      content: props.content,
      updated: currentTimestamp(),
    };

    this.validate(sharedValueFile);

    await this.jsonFileService.update(
      sharedValueFile,
      sharedValueFilePath,
      sharedValueFileSchema
    );
    await this.gitService.add(projectPath, [sharedValueFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.update);

    return sharedValueFile;
  }

  /**
   * Deletes given shared Value
   */
  public async delete(props: DeleteSharedValueProps): Promise<void> {
    deleteSharedValueSchema.parse(props);

    const projectPath = CoreUtil.pathTo.project(props.projectId);
    const valueFilePath = CoreUtil.pathTo.sharedValueFile(
      props.projectId,
      props.id,
      props.language
    );

    await Fs.remove(valueFilePath);
    await this.gitService.add(projectPath, [valueFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.delete);
  }

  public async list(
    props: ListSharedValuesProps
  ): Promise<PaginatedList<SharedValue>> {
    listSharedValuesSchema.parse(props);

    const references = await this.listReferences(
      fileTypeSchema.Enum.sharedValue,
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
      await this.listReferences(
        fileTypeSchema.Enum.sharedValue,
        props.projectId
      )
    ).length;

    return count;
  }

  /**
   * Checks if given object is a shared Value
   */
  public isSharedValue(obj: BaseFile | unknown): obj is SharedValue {
    return sharedValueSchema.safeParse(obj).success;
  }

  /**
   * Reads the given shared Values content based on it's ValueType
   */
  private validate(sharedValue: SharedValueFile) {
    switch (sharedValue.valueType) {
      case ValueTypeSchema.Enum.boolean:
        z.boolean().parse(sharedValue.content);
        break;
      case ValueTypeSchema.Enum.number:
        z.number().parse(sharedValue.content);
        break;
      case ValueTypeSchema.Enum.string:
        z.string().parse(sharedValue.content);
        break;
      default:
        throw new Error(
          `Error validating content of unsupported shared Value with ValueType "${sharedValue.valueType}"`
        );
    }
  }
}
