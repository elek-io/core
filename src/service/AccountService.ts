import {
  cloudTokenSchema,
  serviceTypeSchema,
  sessionResponseSchema,
  signInResponseSchema,
  signInSchema,
  signUpResponseSchema,
  signUpSchema,
  type CloudAccount,
  type CloudSession,
  type ElekIoCoreOptions,
  type SignInProps,
  type SignUpProps,
  type SignUpResult,
  type SupportedLanguage,
  type UserSettings,
} from '../schema/index.js';
import type { CloudClient, CloudTokenListener } from '../util/cloud.js';
import type { PathTo } from '../util/node.js';
import { CoreError } from '../util/shared.js';
import { AbstractService } from './AbstractService.js';
import type { LogService } from './LogService.js';
import type { UserService } from './UserService.js';

/**
 * The elek.io account Core is signed in to, reached as `core.cloud.account`.
 *
 * Signing in keeps a bearer token in memory for every later call using it and
 * makes the User follow the account. Core never writes the token anywhere,
 * so a host persists it and passes it back as `cloud.token`. No call here
 * is retried.
 *
 * @see ../../contributing/cloud.md
 */
export class AccountService extends AbstractService {
  /** Appended to the configured Cloud URL, which never ends in a slash */
  private static readonly paths = {
    signUp: '/api/auth/sign-up/email',
    signIn: '/api/auth/sign-in/email',
    signOut: '/api/auth/sign-out',
    session: '/api/auth/get-session',
  } as const;

  /** The header a session's token arrives in, sent back as it is */
  private static readonly tokenHeader = 'set-auth-token';

  /** What a User starts with when signing in is the first thing it does */
  private static readonly defaultLanguage: SupportedLanguage = 'en';
  private static readonly defaultSettings: UserSettings = {
    localApi: { isEnabled: false, port: 31310 },
  };

  private readonly cloudClient: CloudClient;
  private readonly userService: UserService;

  public constructor(
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    cloudClient: CloudClient,
    userService: UserService
  ) {
    super(serviceTypeSchema.enum.Account, options, pathTo, logService);

    this.cloudClient = cloudClient;
    this.userService = userService;
  }

  /**
   * Whether Core holds a token, which every Cloud call then carries. False
   * after `signOut()`, after a 401 and after `read()` found no live session.
   */
  public get hasToken(): boolean {
    return this.cloudClient.hasToken;
  }

  /**
   * Tells `listener` every token Core keeps and drops, with null for a
   * dropped one, so a host keeps its stored copy current. Not called for the
   * token Core started with. Returns the function that removes the listener.
   *
   * A listener that throws or rejects is logged and changes nothing else.
   */
  public onTokenChange(listener: CloudTokenListener): () => void {
    return this.cloudClient.onTokenChange(listener);
  }

  /**
   * Creates an elek.io account. An answer of `session` signs in as
   * `signIn()` does. An answer of `verification` carries no account, keeps
   * no token and leaves the User as it was.
   *
   * Throws `BadRequest` for rejected props, `Conflict` for an address an
   * account already holds, `RateLimited`, `PreconditionFailed` when Cloud is
   * unreachable or silent for 15 seconds, and `Internal` otherwise.
   */
  public async signUp(props: SignUpProps): Promise<SignUpResult> {
    return this.validated('signUp', signUpSchema, props, async (signUp) => {
      const response = await this.cloudClient.request({
        method: 'POST',
        path: AccountService.paths.signUp,
        body: JSON.stringify(signUp),
        subject: 'the sign up',
        isAnonymous: true,
        refusals: [
          {
            status: 422,
            code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
            type: 'Conflict',
            message: 'An elek.io account already holds this address',
          },
        ],
      });
      const answer = await this.cloudClient.parse(
        response,
        signUpResponseSchema,
        'the sign up'
      );

      if (answer.token === null) {
        this.logService.info({
          source: 'core',
          message:
            'Signed up to elek.io Cloud, the address has to be verified before signing in',
        });
        return { outcome: 'verification' };
      }

      const session = await this.begin(response, answer.user, 'the sign up');
      this.logService.info({
        source: 'core',
        message: 'Signed up and signed in to elek.io Cloud',
      });
      return { outcome: 'session', ...session };
    });
  }

  /**
   * Signs in, keeps the token for every later call using it, replacing one held
   * before, and sets a `cloud` User with the account's id, name and email.
   *
   * Throws `Unauthorized` for a wrong address or password, `Conflict` for an
   * address that is not verified yet, and `BadRequest`, `RateLimited`,
   * `PreconditionFailed` or `Internal` as `signUp()` does. It never sends the
   * token Core holds, and a refusal keeps that token and the User.
   */
  public async signIn(props: SignInProps): Promise<CloudSession> {
    return this.validated('signIn', signInSchema, props, async (signIn) => {
      const response = await this.cloudClient.request({
        method: 'POST',
        path: AccountService.paths.signIn,
        body: JSON.stringify(signIn),
        subject: 'the sign in',
        isAnonymous: true,
        refusals: [
          {
            status: 401,
            type: 'Unauthorized',
            message: 'elek.io Cloud refused the address or the password',
          },
          {
            status: 403,
            code: 'EMAIL_NOT_VERIFIED',
            type: 'Conflict',
            message:
              'The address of this elek.io account has to be verified before signing in',
          },
        ],
      });
      const answer = await this.cloudClient.parse(
        response,
        signInResponseSchema,
        'the sign in'
      );

      const session = await this.begin(response, answer.user, 'the sign in');
      this.logService.info({
        source: 'core',
        message: 'Signed in to elek.io Cloud',
      });
      return session;
    });
  }

  /**
   * Ends the session and sets a `local` User keeping the name and email.
   *
   * It signs out on this machine whatever Cloud answers. When the request
   * fails, Core still forgets the token, sets the User, logs a warning and
   * resolves, and the session stays live until it expires. Without a token
   * it sends nothing. Throws `Internal` only when the User cannot be set.
   */
  public async signOut(): Promise<void> {
    return this.guarded('signOut', async () => {
      if (this.cloudClient.hasToken) {
        await this.endSession();
        this.cloudClient.forget();
      }

      const user = await this.userService.get();
      if (user?.userType === 'cloud') {
        await this.userService.set({ ...user, userType: 'local', id: null });
      }
      this.logService.info({
        source: 'core',
        message: 'Signed out of elek.io Cloud',
      });
    });
  }

  /**
   * Reads the account of the session Core holds, or null without a request
   * while it holds no token. The User follows the account it answers, as on
   * signing in, and is written only when it differs.
   *
   * Answers null and forgets the token when the session is not live, which
   * leaves the User as it is. Throws `PreconditionFailed` when Cloud is
   * unreachable or silent for 15 seconds, and `Internal` otherwise.
   */
  public async read(): Promise<CloudAccount | null> {
    return this.guarded('read', async () => {
      if (this.cloudClient.hasToken === false) {
        return null;
      }

      let response: Response;
      try {
        response = await this.cloudClient.request({
          method: 'GET',
          path: AccountService.paths.session,
          subject: 'the session read',
        });
      } catch (error) {
        // A 401 forgot the token on the way, so it is the answer a session
        // that is not live gives, only put differently. Read through the
        // getter, since the check above narrowed the client's
        if (error instanceof CoreError && this.hasToken === false) {
          return null;
        }
        throw error;
      }

      const answer = await this.cloudClient.parse(
        response,
        sessionResponseSchema,
        'the session read'
      );
      if (answer === null) {
        this.cloudClient.forget();
        this.logService.info({
          source: 'core',
          message:
            'Forgot the elek.io Cloud token, because its session is not live',
        });
        return null;
      }
      await this.followAccount(answer.user);
      return answer.user;
    });
  }

  /**
   * Turns an accepted answer into a session: the token from its header, the
   * User following the account, and only then the token kept, so a User that
   * could not be set leaves no token behind either.
   */
  private async begin(
    response: Response,
    account: CloudAccount,
    subject: string
  ): Promise<CloudSession> {
    const token = cloudTokenSchema.safeParse(
      response.headers.get(AccountService.tokenHeader)
    );
    if (token.success === false) {
      throw CoreError.internal(
        `elek.io Cloud accepted ${subject} but answered no token Core can send`
      );
    }

    await this.followAccount(account);
    this.cloudClient.keep(token.data);

    return { token: token.data, account };
  }

  /**
   * Sets the `cloud` User of `account`, keeping the language and the local
   * API settings, and writes nothing while the User already follows it
   */
  private async followAccount(account: CloudAccount): Promise<void> {
    const user = await this.userService.get();
    if (
      user?.userType === 'cloud' &&
      user.id === account.id &&
      user.name === account.name &&
      user.email === account.email
    ) {
      return;
    }
    await this.userService.set({
      userType: 'cloud',
      id: account.id,
      name: account.name,
      email: account.email,
      language: user?.language ?? AccountService.defaultLanguage,
      localApi: user?.localApi ?? AccountService.defaultSettings.localApi,
    });
  }

  /**
   * Asks Cloud to end the session, and logs rather than throws when it does
   * not, because signing out on this machine must not depend on the network
   */
  private async endSession(): Promise<void> {
    try {
      // Cloud answers 415 to a sign out without a body, and the session
      // then stays live
      await this.cloudClient.request({
        method: 'POST',
        path: AccountService.paths.signOut,
        body: '{}',
        subject: 'the sign out',
      });
    } catch (error) {
      // A 401 forgot the token on the way. It says the session was not live
      // anyway, so nothing stays behind
      if (this.cloudClient.hasToken === false) {
        return;
      }
      this.logService.warn({
        source: 'core',
        message:
          'Signed out on this machine only, elek.io Cloud did not end the session',
        meta: {
          'error.type': error instanceof CoreError ? error.type : 'Internal',
        },
      });
    }
  }
}
