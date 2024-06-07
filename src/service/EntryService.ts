import {
  ValueTypeSchema,
  countEntriesSchema,
  createEntrySchema,
  currentTimestamp,
  deleteEntrySchema,
  entryFileSchema,
  entrySchema,
  getValueContentSchemaFromDefinition,
  listEntriesSchema,
  objectTypeSchema,
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
  type ResolvedValueContentReference,
  type ResolvedValueContentReferenceToAsset,
  type ResolvedValueContentReferenceToEntry,
  type UpdateEntryProps,
  type Value,
  type ValueContentReference,
  type ValueContentReferenceToAsset,
  type ValueContentReferenceToEntry,
  type ValueDefinition,
} from '@elek-io/shared';
import Fs from 'fs-extra';
import * as CoreUtil from '../util/index.js';
import AbstractCrudService from './AbstractCrudService.js';
import type AssetService from './AssetService.js';
import CollectionService from './CollectionService.js';
import GitService from './GitService.js';
import JsonFileService from './JsonFileService.js';
// import SharedValueService from './SharedValueService.js';

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
  private assetService: AssetService;
  // private sharedValueService: SharedValueService;

  constructor(
    options: ElekIoCoreOptions,
    jsonFileService: JsonFileService,
    gitService: GitService,
    collectionService: CollectionService,
    assetService: AssetService
    // sharedValueService: SharedValueService
  ) {
    super(serviceTypeSchema.Enum.Entry, options);

    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
    this.collectionService = collectionService;
    this.assetService = assetService;
    // this.sharedValueService = sharedValueService;
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
      created: currentTimestamp(),
    };

    const entry: Entry = await this.toEntry({
      projectId: props.projectId,
      collectionId: props.collectionId,
      entryFile,
    });

    this.validateValues({
      collectionId: props.collectionId,
      valueDefinitions: collection.valueDefinitions,
      values: entry.values,
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
      CoreUtil.pathTo.entryFile(props.projectId, props.collectionId, props.id),
      entryFileSchema
    );

    return await this.toEntry({
      projectId: props.projectId,
      collectionId: props.collectionId,
      entryFile,
    });
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
      updated: currentTimestamp(),
    };

    const entry: Entry = await this.toEntry({
      projectId: props.projectId,
      collectionId: props.collectionId,
      entryFile,
    });

    this.validateValues({
      collectionId: props.collectionId,
      valueDefinitions: collection.valueDefinitions,
      values: entry.values,
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
      props.id
    );

    await Fs.remove(entryFilePath);
    await this.gitService.add(projectPath, [entryFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.delete);
  }

  public async list(props: ListEntriesProps) {
    listEntriesSchema.parse(props);

    const references = await this.listReferences(
      objectTypeSchema.Enum.entry,
      props.projectId,
      props.collectionId
    );
    const list = await CoreUtil.returnResolved(
      references.map((reference) => {
        return this.read({
          projectId: props.projectId,
          collectionId: props.collectionId,
          id: reference.id,
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
        objectTypeSchema.Enum.entry,
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
    values: Value[];
  }) {
    props.values.map((value) => {
      const definition = this.getValueDefinitionById({
        collectionId: props.collectionId,
        valueDefinitions: props.valueDefinitions,
        id: value.definitionId,
      });
      const schema = getValueContentSchemaFromDefinition(definition);

      try {
        if (value.valueType === 'reference') {
          schema.parse(value.content);
        } else {
          for (const [language, content] of Object.entries(value.content)) {
            schema.parse(content);
          }
        }
      } catch (error) {
        console.log('Definition:', definition);
        console.log('Value:', value);
        throw error;
      }
    });
  }

  /**
   * Validates given shared Value references against it's Collections definitions
   */
  // private validateResolvedSharedValues(props: {
  //   collectionId: string;
  //   valueDefinitions: ValueDefinition[];
  //   resolvedSharedValues: ResolvedSharedValueReference[];
  // }) {
  //   props.resolvedSharedValues.map((value) => {
  //     const definition = this.getValueDefinitionById({
  //       collectionId: props.collectionId,
  //       valueDefinitions: props.valueDefinitions,
  //       id: value.definitionId,
  //     });
  //     const schema = getValueSchemaFromDefinition(definition);
  //     schema.parse(value.resolved.content);
  //   });
  // }

  private async resolveValueContentReference(props: {
    projectId: string;
    collectionId: string;
    valueContentReference: ValueContentReference;
  }): Promise<ResolvedValueContentReference> {
    switch (props.valueContentReference.referenceObjectType) {
      case objectTypeSchema.Enum.asset:
        return this.resolveValueContentReferenceToAsset({
          projectId: props.projectId,
          valueContentReferenceToAsset: props.valueContentReference,
        });
      case objectTypeSchema.Enum.entry:
        return this.resolveValueContentReferenceToEntry({
          projectId: props.projectId,
          collectionId: props.collectionId,
          valueContentReferenceToEntry: props.valueContentReference,
        });
      // case objectTypeSchema.Enum.sharedValue:
      //   return this.resolveValueContentReferenceToSharedValue({
      //     projectId: props.projectId,
      //     valueContentReferenceToSharedValue: props.valueContentReference,
      //   });

      default:
        throw new Error(
          // @ts-ignore
          `Tried to resolve unsupported Value reference "${props.valueContentReference.referenceObjectType}"`
        );
    }
  }

  private async resolveValueContentReferenceToAsset(props: {
    projectId: string;
    valueContentReferenceToAsset: ValueContentReferenceToAsset;
  }): Promise<ResolvedValueContentReferenceToAsset> {
    const resolvedReferences = await Promise.all(
      props.valueContentReferenceToAsset.references.map(async (reference) => {
        const resolvedAsset = await this.assetService.read({
          projectId: props.projectId,
          id: reference.id,
          language: reference.language,
        });
        return resolvedAsset;
      })
    );

    return {
      ...props.valueContentReferenceToAsset,
      references: resolvedReferences,
    };
  }

  private async resolveValueContentReferenceToEntry(props: {
    projectId: string;
    collectionId: string;
    valueContentReferenceToEntry: ValueContentReferenceToEntry;
  }): Promise<ResolvedValueContentReferenceToEntry> {
    const resolvedReferences = await Promise.all(
      props.valueContentReferenceToEntry.references.map(async (reference) => {
        const resolvedEntry = await this.read({
          projectId: props.projectId,
          collectionId: props.collectionId,
          id: reference.id,
        });
        return resolvedEntry;
      })
    );

    return {
      ...props.valueContentReferenceToEntry,
      references: resolvedReferences,
    };
  }

  // private async resolveValueContentReferenceToSharedValue(props: {
  //   projectId: string;
  //   valueContentReferenceToSharedValue: ValueContentReferenceToSharedValue;
  // }): Promise<ResolvedValueContentReferenceToSharedValue> {
  //   const resolvedSharedValue = await this.sharedValueService.read({
  //     projectId: props.projectId,
  //     id: props.valueContentReferenceToSharedValue.references.id,
  //     language: props.valueContentReferenceToSharedValue.references.language,
  //   });

  //   return {
  //     ...props.valueContentReferenceToSharedValue,
  //     references: {
  //       ...props.valueContentReferenceToSharedValue.references,
  //       resolved: resolvedSharedValue,
  //     },
  //   };
  // }

  /**
   * Creates an Entry from given EntryFile by resolving it's Values
   */
  private async toEntry(props: {
    projectId: string;
    collectionId: string;
    entryFile: EntryFile;
  }): Promise<Entry> {
    const entry: Entry = {
      ...props.entryFile,
      values: await Promise.all(
        props.entryFile.values.map(async (value) => {
          if (value.valueType === ValueTypeSchema.Enum.reference) {
            const resolvedValueContentReference =
              await this.resolveValueContentReference({
                projectId: props.projectId,
                collectionId: props.collectionId,
                valueContentReference: value.content,
              });

            return {
              ...value,
              content: resolvedValueContentReference,
            };
          }

          return value;
        })
      ),
    };

    return entry;
  }
}
