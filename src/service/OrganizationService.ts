import {
  cloudOrganizationListResponseSchema,
  cloudSlugCheckResponseSchema,
  createCloudOrganizationSchema,
  createdCloudOrganizationSchema,
  isSlugAvailableCloudOrganizationSchema,
  serviceTypeSchema,
  type CloudOrganization,
  type CreateCloudOrganizationProps,
  type CreatedCloudOrganization,
  type ElekIoCoreOptions,
  type IsSlugAvailableCloudOrganizationProps,
} from '../schema/index.js';
import type { CloudClient, CloudRefusal } from '../util/cloud.js';
import type { PathTo } from '../util/node.js';
import { CoreError } from '../util/shared.js';
import { AbstractService } from './AbstractService.js';
import type { LogService } from './LogService.js';

/**
 * The elek.io Cloud organizations of the account Core is signed in to,
 * reached as `core.cloud.organizations`. Every call needs a session and
 * throws `Unauthorized` without one, before sending anything. No call is
 * retried.
 *
 * @see ../../docs/cloud-projects.md
 * @see ../../contributing/cloud-projects.md
 */
export class OrganizationService extends AbstractService {
  /** Appended to the configured Cloud URL, which never ends in a slash */
  private static readonly paths = {
    list: '/management/v1/organizations',
    checkSlug: '/api/auth/organization/check-slug',
    create: '/api/auth/organization/create',
  } as const;

  /** The refusal of a slug another organization holds, never naming it */
  private static readonly slugTaken: CloudRefusal = {
    status: 400,
    code: 'ORGANIZATION_SLUG_ALREADY_TAKEN',
    type: 'Conflict',
    message: 'Another organization on elek.io Cloud holds this slug',
  };

  private readonly cloudClient: CloudClient;

  public constructor(
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    cloudClient: CloudClient
  ) {
    super(serviceTypeSchema.enum.Organization, options, pathTo, logService);

    this.cloudClient = cloudClient;
  }

  /**
   * Every organization the account is a member of, oldest first, with the
   * account's roles, the plan and how many Projects it holds against its
   * limit. An account in none gets an empty list.
   *
   * Throws `Unauthorized` without a live session, `RateLimited`,
   * `PreconditionFailed` when Cloud is unreachable or silent for 15 seconds,
   * and `Internal` otherwise.
   */
  public async list(): Promise<CloudOrganization[]> {
    return this.guarded('list', async () => {
      const subject = 'the organization list';
      const response = await this.cloudClient.request({
        method: 'GET',
        path: OrganizationService.paths.list,
        subject,
        isSessionRequired: true,
      });
      const answer = await this.cloudClient.parse(
        response,
        cloudOrganizationListResponseSchema,
        subject
      );
      return answer.organizations;
    });
  }

  /**
   * Whether no organization holds the slug yet. A slug that breaks the rule
   * of `cloudOrganizationSlugSchema` throws `BadRequest` before anything is
   * sent, and otherwise this throws as `list()` does.
   *
   * @see ../../docs/cloud-projects.md
   */
  public async isSlugAvailable(
    props: IsSlugAvailableCloudOrganizationProps
  ): Promise<boolean> {
    return this.validated(
      'isSlugAvailable',
      isSlugAvailableCloudOrganizationSchema,
      props,
      async (check) => {
        const subject = 'the slug check';
        let response: Response;
        try {
          response = await this.cloudClient.request({
            method: 'POST',
            path: OrganizationService.paths.checkSlug,
            body: JSON.stringify({ slug: check.slug }),
            subject,
            isSessionRequired: true,
            refusals: [OrganizationService.slugTaken],
          });
        } catch (error) {
          // Only the refusal above maps to Conflict here
          if (error instanceof CoreError && error.type === 'Conflict') {
            return false;
          }
          throw error;
        }
        const answer = await this.cloudClient.parse(
          response,
          cloudSlugCheckResponseSchema,
          subject
        );
        return answer.status;
      }
    );
  }

  /**
   * Creates an organization and makes the account its `owner`. Its plan
   * starts as `hobby`.
   *
   * Throws `Conflict` when another organization holds the slug, `BadRequest`
   * for a slug that breaks the rule, before anything is sent, and otherwise
   * as `list()` does. Creating again after a timeout can answer `Conflict`
   * for the organization the first call made.
   *
   * @see ../../docs/cloud-projects.md
   */
  public async create(
    props: CreateCloudOrganizationProps
  ): Promise<CreatedCloudOrganization> {
    return this.validated(
      'create',
      createCloudOrganizationSchema,
      props,
      async (organization) => {
        const subject = 'the organization';
        const response = await this.cloudClient.request({
          method: 'POST',
          path: OrganizationService.paths.create,
          body: JSON.stringify(organization),
          subject,
          isSessionRequired: true,
          refusals: [
            {
              ...OrganizationService.slugTaken,
              code: 'ORGANIZATION_ALREADY_EXISTS',
            },
          ],
        });
        const created = await this.cloudClient.parse(
          response,
          createdCloudOrganizationSchema,
          subject
        );
        this.logService.info({
          source: 'core',
          message: 'Created an organization on elek.io Cloud',
          meta: { 'elek.organization.id': created.id },
        });
        return created;
      }
    );
  }
}
