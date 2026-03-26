import { errAsync, okAsync } from 'neverthrow';
import {
  userTypeSchema,
  setUserSchema,
  userFileSchema,
  type SetUserProps,
  type User,
  type UserFile,
} from '../schema/index.js';
import { pathTo } from '../util/node.js';
import { parseSchema, type CoreResult } from '../util/shared.js';
import type { JsonFileService } from './JsonFileService.js';
import type { LogService } from './LogService.js';

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
  public get(): CoreResult<User | null> {
    return this.jsonFileService
      .read(pathTo.userFile, userFileSchema)
      .orElse(() => {
        this.logService.info({ source: 'core', message: 'No User found' });
        return okAsync(null);
      });
  }

  /**
   * Sets the User currently working with Core
   *
   * By doing so all git operations are done with the signature of this User
   */
  public set(props: SetUserProps): CoreResult<User> {
    const validated = parseSchema(setUserSchema, props);
    if (validated.isErr()) {
      return errAsync(validated.error);
    }

    const userFilePath = pathTo.userFile;

    const userFile: UserFile = {
      ...props,
    };

    if (userFile.userType === userTypeSchema.enum.cloud) {
      // Try logging in the user
      // Return error on failure
    }

    return this.jsonFileService
      .update(userFile, userFilePath, userFileSchema)
      .map(() => {
        this.logService.debug({
          source: 'core',
          message: 'Updated User',
        });
        return userFile;
      });
  }
}
