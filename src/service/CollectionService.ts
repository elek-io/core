import {
  collectionFileSchema,
  countCollectionsSchema,
  createCollectionSchema,
  currentTimestamp,
  deleteCollectionSchema,
  listCollectionsSchema,
  objectTypeSchema,
  readCollectionSchema,
  serviceTypeSchema,
  slug,
  updateCollectionSchema,
  uuid,
  type BaseFile,
  type Collection,
  type CollectionFile,
  type CountCollectionsProps,
  type CreateCollectionProps,
  type DeleteCollectionProps,
  type ElekIoCoreOptions,
  type ExtendedCrudService,
  type ListCollectionsProps,
  type PaginatedList,
  type ReadCollectionProps,
  type UpdateCollectionProps,
} from '@elek-io/shared';
import Fs from 'fs-extra';
import * as CoreUtil from '../util/index.js';
import AbstractCrudService from './AbstractCrudService.js';
import GitService from './GitService.js';
import JsonFileService from './JsonFileService.js';

/**
 * Service that manages CRUD functionality for Collection files on disk
 */
export default class CollectionService
  extends AbstractCrudService
  implements ExtendedCrudService<Collection>
{
  private jsonFileService: JsonFileService;
  private gitService: GitService;

  constructor(
    options: ElekIoCoreOptions,
    jsonFileService: JsonFileService,
    gitService: GitService
  ) {
    super(serviceTypeSchema.Enum.Collection, options);

    this.jsonFileService = jsonFileService;
    this.gitService = gitService;
  }

  /**
   * Creates a new Collection
   */
  public async create(props: CreateCollectionProps): Promise<Collection> {
    createCollectionSchema.parse(props);

    const id = uuid();
    const projectPath = CoreUtil.pathTo.project(props.projectId);
    const collectionPath = CoreUtil.pathTo.collection(props.projectId, id);
    const collectionFilePath = CoreUtil.pathTo.collectionFile(
      props.projectId,
      id
    );

    const collectionFile: CollectionFile = {
      ...props,
      objectType: 'collection',
      id,
      slug: {
        singular: slug(props.slug.singular),
        plural: slug(props.slug.plural),
      },
      created: currentTimestamp(),
      updated: null,
    };

    await Fs.ensureDir(collectionPath);
    await this.jsonFileService.create(
      collectionFile,
      collectionFilePath,
      collectionFileSchema
    );
    await this.gitService.add(projectPath, [collectionFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.create);

    return collectionFile;
  }

  /**
   * Returns a Collection by ID
   */
  public async read(props: ReadCollectionProps): Promise<Collection> {
    readCollectionSchema.parse(props);

    const collection = await this.jsonFileService.read(
      CoreUtil.pathTo.collectionFile(props.projectId, props.id),
      collectionFileSchema
    );

    return collection;
  }

  /**
   * Updates given Collection
   *
   * @todo finish implementing checks for FieldDefinitions and extract methods
   *
   * @param projectId   Project ID of the collection to update
   * @param collection  Collection to write to disk
   * @returns           An object containing information about the actions needed to be taken,
   *                    before given update can be executed or void if the update was executed successfully
   */
  public async update(props: UpdateCollectionProps): Promise<Collection> {
    updateCollectionSchema.parse(props);

    const projectPath = CoreUtil.pathTo.project(props.projectId);
    const collectionFilePath = CoreUtil.pathTo.collectionFile(
      props.projectId,
      props.id
    );
    const prevCollectionFile = await this.read(props);

    const collectionFile: CollectionFile = {
      ...prevCollectionFile,
      ...props,
      updated: currentTimestamp(),
    };

    // @todo Collection Service has to check if any of the updated fieldDefinitions do not validate against the used Fields in each CollectionItem of the Collection
    // and return a list of mismatches, so the user can choose what to do in the UI / a wizard
    // For that:
    // - Iterate over all CollectionItems inside Collection
    // - Create an array with all FieldReferences of those CollectionItems
    // - Load all Fields by those references and check if the Field still complies with the new definition

    // const result: CollectionUpdateResult = {
    //   create: [],
    //   update: [],
    //   delete: [],
    // };

    // const currentCollection = await this.read(props);
    // Iterate over all FieldDefinitions and check each for changes
    // for (let index = 0; index < collection.fieldDefinitions.length; index++) {
    //   const nextFieldDefinition = collection.fieldDefinitions[index];
    //   if (!nextFieldDefinition) {
    //     throw new Error('Could not find any field definition');
    //   }
    //   // Get the correct FieldDefinition by ID
    //   const currentFieldDefinition = currentCollection.fieldDefinitions.find(
    //     (current) => {
    //       return current.id === nextFieldDefinition.id;
    //     }
    //   );
    //   if (currentFieldDefinition) {
    //     if (
    //       currentFieldDefinition.isRequired === false &&
    //       nextFieldDefinition.isRequired === true
    //     ) {
    //       // Case 1.
    //       // A FieldDefinition was not required to be filled, but is now
    //       // -> Check if all CollectionItems have a FieldReference to this definition (if not create)
    //       // -> Check all values of referenced fields of this definition for null (if not update)
    //       // -> If the value is null, this is a violation
    //       const collectionItems = (
    //         await this.collectionItemService.list(
    //           projectId,
    //           collection.id,
    //           undefined,
    //           undefined,
    //           0,
    //           0
    //         )
    //       ).list;
    //       for (let index = 0; index < collectionItems.length; index++) {
    //         const collectionItem = collectionItems[index];
    //         if (!collectionItem) {
    //           throw new Error('Blaa');
    //         }
    //         const fieldReference = collectionItem.fieldReferences.find(
    //           (fieldReference) => {
    //             return (
    //               fieldReference.fieldDefinitionId === nextFieldDefinition.id
    //             );
    //           }
    //         );
    //         if (!fieldReference) {
    //           result.create.push({
    //             violation: Violation.FIELD_REQUIRED_BUT_UNDEFINED,
    //             collectionItem,
    //             fieldDefinition: nextFieldDefinition,
    //           });
    //         } else {
    //           const field = await this.fieldService.read(
    //             projectId,
    //             fieldReference.field.id,
    //             fieldReference.field.language
    //           );
    //           if (field.value === null) {
    //             result.update.push({
    //               violation: Violation.FIELD_VALUE_REQUIRED_BUT_NULL,
    //               collectionItem,
    //               fieldReference,
    //             });
    //           }
    //         }
    //       }
    //     }
    //     if (
    //       currentFieldDefinition.isUnique !== nextFieldDefinition.isUnique &&
    //       nextFieldDefinition.isUnique === true
    //     ) {
    //       // Case 2.
    //       // A FieldDefinition was not required to be unique, but is now
    //       // -> Check all current values of referenced fields
    //       // -> If a value is not unique, this is a violation
    //       // const fieldReferences = await this.collectionItemService.getAllFieldReferences(project, currentCollection, currentFieldDefinition.id);
    //       // const fields = await this.fieldService.readAll(project, fieldReferences);
    //       // const duplicates = Util.getDuplicates(fields, 'value');
    //       // for (let index = 0; index < duplicates.length; index++) {
    //       //   const duplicate = duplicates[index];
    //       //   result.update.push({
    //       //     violation: Violation.FIELD_VALUE_NOT_UNIQUE,
    //       //     collectionItem: ,
    //       //     fieldReference
    //       //   });
    //       // }
    //     }
    //     if (
    //       isEqual(currentFieldDefinition.input, nextFieldDefinition.input) ===
    //       false
    //     ) {
    //       // Case 3.
    //       // A FieldDefinition has a new input specification
    //       // -> Check if this input is valid for given FieldType
    //       // -> If not, this is a violation
    //     }
    //   } else {
    //     // It's a new FieldDefinition that was not existing before
    //     if (nextFieldDefinition.isRequired) {
    //       // Case 4.
    //       // A FieldDefinition is new and a field (with value) required
    //       // -> The user needs to add a field reference (either through a new or existing field)
    //       // for every CollectionItem of this Collection
    //       const collectionItems = (
    //         await this.collectionItemService.list(
    //           projectId,
    //           collection.id,
    //           undefined,
    //           undefined,
    //           0,
    //           0
    //         )
    //       ).list;
    //       collectionItems.forEach((collectionItem) => {
    //         result.create.push({
    //           violation: Violation.FIELD_REQUIRED_BUT_UNDEFINED,
    //           collectionItem,
    //           fieldDefinition: nextFieldDefinition,
    //         });
    //       });
    //     }
    //   }
    // }

    // // Return early to notify the user of changes he has to do before this update is working
    // if (
    //   result.create.length !== 0 ||
    //   result.update.length !== 0 ||
    //   result.delete.length !== 0
    // ) {
    //   return result;
    // }

    await this.jsonFileService.update(
      collectionFile,
      collectionFilePath,
      collectionFileSchema
    );
    await this.gitService.add(projectPath, [collectionFilePath]);
    await this.gitService.commit(projectPath, this.gitMessage.update);
    return collectionFile;
  }

  /**
   * Deletes given Collection (folder), including it's items
   *
   * The Fields that Collection used are not deleted.
   */
  public async delete(props: DeleteCollectionProps): Promise<void> {
    deleteCollectionSchema.parse(props);

    const projectPath = CoreUtil.pathTo.project(props.projectId);
    const collectionPath = CoreUtil.pathTo.collection(
      props.projectId,
      props.id
    );

    await Fs.remove(collectionPath);
    await this.gitService.add(projectPath, [collectionPath]);
    await this.gitService.commit(projectPath, this.gitMessage.delete);
  }

  public async list(
    props: ListCollectionsProps
  ): Promise<PaginatedList<Collection>> {
    listCollectionsSchema.parse(props);

    const references = await this.listReferences(
      objectTypeSchema.Enum.collection,
      props.projectId
    );
    const list = await CoreUtil.returnResolved(
      references.map((reference) => {
        return this.read({
          projectId: props.projectId,
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

  public async count(props: CountCollectionsProps): Promise<number> {
    countCollectionsSchema.parse(props);

    const count = (
      await this.listReferences(
        objectTypeSchema.Enum.collection,
        props.projectId
      )
    ).length;

    return count;
  }

  /**
   * Checks if given object is of type Collection
   */
  public isCollection(obj: BaseFile | unknown): obj is Collection {
    return collectionFileSchema.safeParse(obj).success;
  }
}
