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
 * The one User per data directory, stored in `user.json` beside the Projects
 * rather than inside one, so it is never committed.
 *
 * Every commit Core makes is authored with it.
 *
 * @see ../../docs/storage-layout.md
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
   * Returns the User currently working with Core, or null.
   *
   * `null` means no `user.json` has been written yet, but also any other read
   * failure, a `user.json` that no longer matches `userFileSchema` included,
   * because the read is caught, logged at info and turned into null. This
   * call never throws.
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
   * Sets the User currently working with Core, so every git operation is
   * signed with them.
   *
   * Overwrites `user.json` in the data directory, creating it when absent, so
   * calling it again replaces the previous User. Throws `BadRequest` when
   * `props` fails `setUserSchema`.
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
    // The identity every later commit is signed with, so it belongs in
    // the record of what happened
    this.logService.info({
      source: 'core',
      message: 'Updated User',
    });
    return userFile;
  }
}
