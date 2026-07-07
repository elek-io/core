import {
  userTypeSchema,
  setUserSchema,
  userFileSchema,
  type SetUserProps,
  type User,
  type UserFile,
} from '../schema/index.js';
import type { PathTo } from '../util/node.js';
import { CoreError } from '../util/shared.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

/**
 * Service to handle the User that is currently working with Core
 */
export class UserService {
  private readonly pathTo: PathTo;
  private readonly logService: LogService;
  private readonly jsonFileService: JsonFileService;

  constructor(
    pathTo: PathTo,
    logService: LogService,
    jsonFileService: JsonFileService
  ) {
    this.pathTo = pathTo;
    this.logService = logService;
    this.jsonFileService = jsonFileService;
  }

  /**
   * Returns the User currently working with Core
   */
  public async get(): Promise<User | null> {
    try {
      return await this.jsonFileService.read(
        this.pathTo.userFile,
        userFileSchema
      );
    } catch {
      this.logService.info({ source: 'core', message: 'No User found' });
      return null;
    }
  }

  /**
   * Sets the User currently working with Core
   *
   * By doing so all git operations are done with the signature of this User
   */
  public async set(props: SetUserProps): Promise<User> {
    const parsed = setUserSchema.safeParse(props);
    if (!parsed.success) {
      throw CoreError.badRequest(parsed.error.message, parsed.error);
    }

    const userFilePath = this.pathTo.userFile;

    const userFile: UserFile = {
      ...props,
    };

    if (userFile.userType === userTypeSchema.enum.cloud) {
      // Try logging in the user
      // Return error on failure
    }

    await this.jsonFileService.update(userFile, userFilePath, userFileSchema);
    this.logService.debug({
      source: 'core',
      message: 'Updated User',
    });
    return userFile;
  }
}
