import {
  UserTypeSchema,
  setUserSchema,
  userFileSchema,
  type SetUserProps,
  type User,
  type UserFile,
} from '../schema/index.js';
import { pathTo } from '../util/node.js';
import { JsonFileService } from './JsonFileService.js';
import { LogService } from './LogService.js';

/**
 * Service to handle the User that is currently working with Core
 */
export class UserService {
  private readonly logService: LogService;
  private readonly jsonFileService: JsonFileService;

  constructor(logService: LogService, jsonFileService: JsonFileService) {
    this.logService = logService;
    this.jsonFileService = jsonFileService;
  }

  /**
   * Returns the User currently working with Core
   */
  public async get(): Promise<User | null> {
    try {
      return await this.jsonFileService.read(pathTo.userFile, userFileSchema);
    } catch (error) {
      this.logService.info('No User found');

      return null;
    }
  }

  /**
   * Sets the User currently working with Core
   *
   * By doing so all git operations are done with the signature of this User
   */
  public async set(props: SetUserProps): Promise<User> {
    setUserSchema.parse(props);

    const userFilePath = pathTo.userFile;

    const userFile: UserFile = {
      ...props,
    };

    if (userFile.userType === UserTypeSchema.Enum.cloud) {
      // Try logging in the user
      // Throw on Error
    }

    await this.jsonFileService.update(userFile, userFilePath, userFileSchema);
    this.logService.debug('Updated User');

    return userFile;
  }
}
