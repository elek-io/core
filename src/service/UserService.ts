import {
  UserTypeSchema,
  setUserSchema,
  userFileSchema,
  type SetUserProps,
  type User,
  type UserFile,
} from '../schema/userSchema.js';
import { pathTo } from '../util/node.js';
import JsonFileService from './JsonFileService.js';

/**
 * Service to handle the User that is currently working with Core
 */
export default class UserService {
  private readonly jsonFileService: JsonFileService;

  constructor(jsonFileService: JsonFileService) {
    this.jsonFileService = jsonFileService;
  }

  /**
   * Returns the User currently working with Core
   */
  public async get(): Promise<User | undefined> {
    try {
      return await this.jsonFileService.read(pathTo.userFile, userFileSchema);
    } catch (error) {
      // Should probably be logged in some way or another
      return undefined;
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

    return userFile;
  }
}
