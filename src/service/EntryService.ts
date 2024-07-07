import Fs from 'fs-extra';
import {
  objectTypeSchema,
  type SupportedLanguage,
} from '../schema/baseSchema.js';
import type { ElekIoCoreOptions } from '../schema/coreSchema.js';
import {
  countEntriesSchema,
  createEntrySchema,
  deleteEntrySchema,
  entryFileSchema,
  entrySchema,
  readEntrySchema,
  updateEntrySchema,
  type CountEntriesProps,
  type CreateEntryProps,
  type DeleteEntryProps,
  type Entry,
  type EntryFile,
  type ReadEntryProps,
  type UpdateEntryProps,
} from '../schema/entrySchema.js';
import type { BaseFile } from '../schema/fileSchema.js';
import {
  listEntriesSchema,
  serviceTypeSchema,
  type ExtendedCrudService,
  type ListEntriesProps,
} from '../schema/serviceSchema.js';
import {
  ValueTypeSchema,
  getValueContentSchemaFromDefinition,
  type ReferencedValue,
  type ResolvedValueContentReference,
  type Value,
  type ValueContentReference,
  type ValueDefinition,
} from '../schema/valueSchema.js';
import * as Util from '../util/index.js';
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

    const id = Util.uuid();
    const projectPath = Util.pathTo.project(props.projectId);
    const entryFilePath = Util.pathTo.entryFile(
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
      created: Util.currentTimestamp(),
      updated: null,
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
      Util.pathTo.entryFile(props.projectId, props.collectionId, props.id),
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

    const projectPath = Util.pathTo.project(props.projectId);
    const entryFilePath = Util.pathTo.entryFile(
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
      updated: Util.currentTimestamp(),
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

    const projectPath = Util.pathTo.project(props.projectId);
    const entryFilePath = Util.pathTo.entryFile(
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

    const offset = props.offset || 0;
    const limit = props.limit || 15;

    const entryReferences = await this.listReferences(
      objectTypeSchema.Enum.entry,
      props.projectId,
      props.collectionId
    );

    const partialEntryReferences = entryReferences.slice(offset, limit);

    const entries = await Util.returnResolved(
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
        for (const [language, content] of Object.entries(value.content)) {
          schema.parse(content);
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
    switch (props.valueContentReference.objectType) {
      case objectTypeSchema.Enum.asset:
        return await this.assetService.read({
          projectId: props.projectId,
          id: props.valueContentReference.id,
          language: props.valueContentReference.language,
        });
      case objectTypeSchema.Enum.entry:
        return await this.read({
          projectId: props.projectId,
          collectionId: props.collectionId,
          id: props.valueContentReference.id,
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

  private async resolveValueContentReferences(props: {
    projectId: string;
    collectionId: string;
    valueReference: ReferencedValue;
  }): Promise<
    Partial<Record<SupportedLanguage, ResolvedValueContentReference>>
  > {
    let resolvedContent: Partial<
      Record<SupportedLanguage, ResolvedValueContentReference>
    > = {};

    for (const language in props.valueReference.content) {
      const referencesOfLanguage =
        props.valueReference.content[language as SupportedLanguage];
      if (!referencesOfLanguage) {
        throw new Error(
          `Trying to access content references by language "${language}" failed`
        );
      }

      const resolvedReferencesOfLanguage = await Promise.all(
        referencesOfLanguage.map(async (reference) => {
          return await this.resolveValueContentReference({
            projectId: props.projectId,
            collectionId: props.collectionId,
            valueContentReference: reference,
          });
        })
      );

      resolvedContent = {
        ...resolvedContent,
        [language as SupportedLanguage]: resolvedReferencesOfLanguage,
      };
    }

    return resolvedContent;
  }

  /**
   * Creates an Entry from given EntryFile by resolving it's Values
   */
  private async toEntry(props: {
    projectId: string;
    collectionId: string;
    entryFile: EntryFile;
  }): Promise<Entry> {
    return {
      ...props.entryFile,
      // @ts-ignore @todo fixme - I have no idea why this happens. The types seem to be compatible to me and they work
      values: await Promise.all(
        props.entryFile.values.map(async (value) => {
          if (value.valueType === ValueTypeSchema.Enum.reference) {
            const resolvedContentReferences =
              await this.resolveValueContentReferences({
                projectId: props.projectId,
                collectionId: props.collectionId,
                valueReference: value,
              });

            return {
              ...value,
              content: resolvedContentReferences,
            };
          }

          return value;
        })
      ),
    };
  }
}
