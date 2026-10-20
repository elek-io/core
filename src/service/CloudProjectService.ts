import {
  cloudProjectListResponseSchema,
  cloudProjectResponseSchema,
  createCloudProjectSchema,
  deleteCloudProjectSchema,
  readCloudProjectSchema,
  serviceTypeSchema,
  updateCloudProjectSchema,
  type CloudProject,
  type CreateCloudProjectProps,
  type DeleteCloudProjectProps,
  type ElekIoCoreOptions,
  type ReadCloudProjectProps,
  type UpdateCloudProjectProps,
} from '../schema/index.js';
import type { CloudClient, CloudRefusal } from '../util/cloud.js';
import type { PathTo } from '../util/node.js';
import { CoreError } from '../util/shared.js';
import { AbstractService } from './AbstractService.js';
import type { LogService } from './LogService.js';

/**
 * The Projects on elek.io Cloud, reached as `core.cloud.projects`, each under
 * the id Core gave the local Project. Every call needs a session and throws
 * `Unauthorized` without one, before sending anything. Creating, updating and
 * deleting change a Project on elek.io Cloud, so read-only mode refuses them.
 *
 * Nothing here touches a local Project. Setting or removing its `origin` is
 * `core.projects`'s.
 *
 * @see ../../docs/cloud-projects.md
 * @see ../../contributing/cloud-projects.md
 */
export class CloudProjectService extends AbstractService {
  /** Appended to the configured Cloud URL, which never ends in a slash */
  private static readonly listPath = '/management/v1/projects';

  /** What elek.io Cloud answers when its git host did not */
  private static readonly gitHostMessage =
    'elek.io Cloud could not reach the git host';

  private readonly cloudClient: CloudClient;

  public constructor(
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    cloudClient: CloudClient
  ) {
    super(serviceTypeSchema.enum.CloudProject, options, pathTo, logService);

    this.cloudClient = cloudClient;
  }

  /**
   * Creates the Project on elek.io Cloud in an organization where the
   * account is an `owner` or `admin`, under the id of the local Project.
   *
   * A Project already there under that id is answered as created, so a
   * create that got no answer can be sent again. Throws `Conflict` when
   * the id is on elek.io Cloud in another organization, and never makes a
   * fresh id.
   *
   * @see ../../docs/cloud-projects.md#creating-a-project
   */
  public async create(props: CreateCloudProjectProps): Promise<CloudProject> {
    return this.mutating(
      'create',
      createCloudProjectSchema,
      props,
      async (create) => {
        let response: Response;
        try {
          response = await this.cloudClient.request({
            method: 'POST',
            path: CloudProjectService.pathOf(create.organizationId),
            // A description not given is undefined, which stringify leaves out
            body: JSON.stringify({
              id: create.id,
              name: create.name,
              description: create.description,
            }),
            subject: 'the Project',
            isSessionRequired: true,
            refusals: this.createRefusals(create),
          });
        } catch (error) {
          // Only project_id_taken maps to Conflict here
          if (error instanceof CoreError && error.type === 'Conflict') {
            return await this.alreadyThere(create);
          }
          throw error;
        }

        const { project } = await this.cloudClient.parse(
          response,
          cloudProjectResponseSchema,
          'the Project'
        );
        this.logService.info({
          source: 'core',
          message: 'Created a Project on elek.io Cloud',
          meta: {
            'elek.organization.id': project.organizationId,
            'elek.project.id': project.id,
          },
        });
        return project;
      }
    );
  }

  /**
   * Every Project the account can see on elek.io Cloud, in every one of its
   * organizations, oldest first.
   *
   * Throws `Unauthorized` without a live session, `RateLimited`,
   * `PreconditionFailed` when Cloud is unreachable or silent for 15 seconds,
   * and `Internal` otherwise.
   */
  public async list(): Promise<CloudProject[]> {
    return this.guarded('list', async () => {
      const subject = 'the Project list';
      const response = await this.cloudClient.request({
        method: 'GET',
        path: CloudProjectService.listPath,
        subject,
        isSessionRequired: true,
      });
      const answer = await this.cloudClient.parse(
        response,
        cloudProjectListResponseSchema,
        subject
      );
      return answer.projects;
    });
  }

  /**
   * Reads one Project of an organization. Throws `NotFound` when the
   * organization holds no Project under the id that the account can see,
   * and otherwise as `list()` does.
   */
  public async read(props: ReadCloudProjectProps): Promise<CloudProject> {
    return this.validated('read', readCloudProjectSchema, props, (read) =>
      this.fetch(read)
    );
  }

  /**
   * Changes the Project's name, its description or both, and sends only what
   * it was given. Its remote stays the same. Throws `BadRequest` for neither,
   * before anything is sent.
   *
   * Needs `owner` or `admin` and throws `Unauthorized` otherwise, and
   * `NotFound` as `read()` does.
   */
  public async update(props: UpdateCloudProjectProps): Promise<CloudProject> {
    return this.mutating(
      'update',
      updateCloudProjectSchema,
      props,
      async (update) => {
        const subject = 'the Project update';
        const response = await this.cloudClient.request({
          method: 'PATCH',
          path: CloudProjectService.pathOf(update.organizationId, update.id),
          // stringify leaves out whichever of the two is undefined
          body: JSON.stringify({
            name: update.name,
            description: update.description,
          }),
          subject,
          isSessionRequired: true,
          refusals: this.refusalsFor(update),
        });
        const { project } = await this.cloudClient.parse(
          response,
          cloudProjectResponseSchema,
          subject
        );
        this.logService.info({
          source: 'core',
          message: 'Updated a Project on elek.io Cloud',
          meta: {
            'elek.organization.id': project.organizationId,
            'elek.project.id': project.id,
          },
        });
        return project;
      }
    );
  }

  /**
   * Deletes the Project and its repository on elek.io Cloud, for every
   * member. The local Project stays as it is, `origin` included.
   *
   * Needs `owner` or `admin`. Throws `PreconditionFailed` when elek.io Cloud
   * could not reach the git host, which keeps the Project and can be sent
   * again, and `NotFound` as `read()` does.
   *
   * @see ../../docs/cloud-projects.md#deleting-a-project
   */
  public async delete(props: DeleteCloudProjectProps): Promise<void> {
    return this.mutating(
      'delete',
      deleteCloudProjectSchema,
      props,
      async (remove) => {
        await this.cloudClient.request({
          method: 'DELETE',
          path: CloudProjectService.pathOf(remove.organizationId, remove.id),
          subject: 'the Project delete',
          isSessionRequired: true,
          refusals: [
            ...this.refusalsFor(remove),
            ...CloudProjectService.gitHostRefusals(
              `${CloudProjectService.gitHostMessage}, so it kept Project "${remove.id}". Delete it again`
            ),
          ],
        });
        this.logService.info({
          source: 'core',
          message: 'Deleted a Project on elek.io Cloud',
          meta: {
            'elek.organization.id': remove.organizationId,
            'elek.project.id': remove.id,
          },
        });
      }
    );
  }

  /** Sends the read, shared by `read()` and the taken-id rule */
  private async fetch(read: ReadCloudProjectProps): Promise<CloudProject> {
    const subject = 'the Project read';
    const response = await this.cloudClient.request({
      method: 'GET',
      path: CloudProjectService.pathOf(read.organizationId, read.id),
      subject,
      isSessionRequired: true,
      refusals: this.refusalsFor(read),
    });
    const { project } = await this.cloudClient.parse(
      response,
      cloudProjectResponseSchema,
      subject
    );
    return project;
  }

  /**
   * Answers a create refused as a taken id. A Project the chosen organization
   * holds under it is the one an earlier create made. Only a 404 says the id
   * is elsewhere, every other failure keeps its own type, since none says
   * where the Project is
   */
  private async alreadyThere(
    create: CreateCloudProjectProps
  ): Promise<CloudProject> {
    try {
      const project = await this.fetch(create);
      this.logService.info({
        source: 'core',
        message:
          'Found the Project on elek.io Cloud already, so creating it again answers that one',
        meta: {
          'elek.organization.id': project.organizationId,
          'elek.project.id': project.id,
        },
      });
      return project;
    } catch (error) {
      if (error instanceof CoreError && error.type === 'NotFound') {
        throw CoreError.conflict(
          `elek.io Cloud holds Project "${create.id}" in another organization, so it stays on this computer`
        );
      }
      throw error;
    }
  }

  /** The refusals of a create, which add the plan's room and the id */
  private createRefusals(create: CreateCloudProjectProps): CloudRefusal[] {
    return [
      {
        status: 402,
        code: 'project_quota_exceeded',
        type: 'QuotaExceeded',
        message: `The plan of organization "${create.organizationId}" has no room for another Project`,
      },
      {
        status: 409,
        code: 'project_id_taken',
        type: 'Conflict',
        message: `elek.io Cloud holds Project "${create.id}" already`,
      },
      {
        status: 409,
        code: 'no_cell_available',
        type: 'PreconditionFailed',
        message:
          'elek.io Cloud cannot take a new Project right now. Nothing was created, create it again later',
      },
      ...this.refusalsFor(create),
      ...CloudProjectService.gitHostRefusals(
        `${CloudProjectService.gitHostMessage}. Nothing was created, create it again`
      ),
    ];
  }

  /** The refusals every call naming one Project reads */
  private refusalsFor(project: ReadCloudProjectProps): CloudRefusal[] {
    return [
      {
        status: 404,
        code: 'project_not_found',
        type: 'NotFound',
        message: `Organization "${project.organizationId}" holds no Project "${project.id}" this session can see`,
      },
      {
        status: 403,
        code: 'forbidden',
        type: 'Unauthorized',
        message: `Only an owner or an admin of organization "${project.organizationId}" may do this`,
      },
      {
        status: 403,
        code: 'not_a_member',
        type: 'Unauthorized',
        message: `The account is not a member of organization "${project.organizationId}"`,
      },
    ];
  }

  /** A 502 and a 504, which is elek.io Cloud's git host not answering it */
  private static gitHostRefusals(message: string): CloudRefusal[] {
    return [502, 504].map(function (status): CloudRefusal {
      return { status, type: 'PreconditionFailed', message };
    });
  }

  /** The projects path of an organization, or of one Project in it */
  private static pathOf(organizationId: string, id?: string): string {
    const projects = `/management/v1/organizations/${organizationId}/projects`;
    return id === undefined ? projects : `${projects}/${id}`;
  }
}
