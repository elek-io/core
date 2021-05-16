import Util from '../util';
import { ElekIoCoreOptions } from '../../type/general';
import { ServiceType } from '../../type/service';
import { ModelReference } from '../../type/model';

/**
 * A base service that provides properties for all other services
 */
export default abstract class AbstractService {
  public readonly type: ServiceType;
  public readonly options: ElekIoCoreOptions;

  /**
   * Dynamically generated git messages for operations
   */
  public readonly gitMessage: {
    create: string;
    update: string;
    delete: string;
  };

  /**
   * Do not instantiate directly as this is an abstract class
   */
  protected constructor(type: ServiceType, options: ElekIoCoreOptions) {
    this.type = type;
    this.options = options;
    this.gitMessage = {
      create: `:heavy_plus_sign: Created new ${this.type}`,
      update: `:wrench: Updated ${this.type}`,
      delete: `:fire: Deleted ${this.type}`
    };
  }

  /**
   * Searches for all files inside given folder,
   * parses their names and returns a list of them
   */
  protected async getModelReferences(path: string): Promise<ModelReference[]> {
    const servicesWithLanguage = [ServiceType.ASSET, ServiceType.BLOCK, ServiceType.PAGE];
    const possibleModels = await Util.files(path);

    return possibleModels.map((possibleModel) => {
      const fileNameArray = possibleModel.name.split('.');

      const id = fileNameArray[0];
      let language = null;
      let extension = null;

      if (Util.validator.isUuid(id) === false) {
        return null;
      }

      if (servicesWithLanguage.includes(this.type)) {
        if (fileNameArray.length !== 3 || Util.validator.isLanguageTag(fileNameArray[1]) === false) {
          return null;
        }
        language = fileNameArray[1];
        extension = fileNameArray[2];
      } else {
        if (fileNameArray.length !== 2) {
          return null;
        }
        extension = fileNameArray[1];
      }

      if (extension !== 'json' && extension !== 'md') {
        return null;
      }

      return {id, language, extension};
    }).filter(Util.notEmpty);
  }
}
