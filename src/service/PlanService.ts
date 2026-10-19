import {
  cloudPlanCheckoutSchema,
  serviceTypeSchema,
  upgradeCloudPlanSchema,
  type CloudPlanCheckout,
  type ElekIoCoreOptions,
  type UpgradeCloudPlanProps,
} from '../schema/index.js';
import type { CloudClient } from '../util/cloud.js';
import type { PathTo } from '../util/node.js';
import { AbstractService } from './AbstractService.js';
import type { LogService } from './LogService.js';

/**
 * The plans of elek.io Cloud organizations, reached as `core.cloud.plans`.
 * Every call needs a session and throws `Unauthorized` without one, before
 * sending anything. No call is retried.
 *
 * @see ../../docs/cloud-projects.md#changing-the-plan
 * @see ../../contributing/cloud-projects.md
 */
export class PlanService extends AbstractService {
  /** Appended to the configured Cloud URL, which never ends in a slash */
  private static readonly upgradePath = '/api/auth/subscription/upgrade';

  private readonly cloudClient: CloudClient;

  public constructor(
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    cloudClient: CloudClient
  ) {
    super(serviceTypeSchema.enum.Plan, options, pathTo, logService);

    this.cloudClient = cloudClient;
  }

  /**
   * Starts moving an organization to a paid plan, and answers the page to
   * open in the browser where the person pays. The organization list answers
   * the new plan once the payment counts. Only an `owner` may.
   *
   * Throws `Unauthorized` for any other role, `Conflict` for a plan with
   * room for fewer Projects than the organization holds, and otherwise as
   * the other `core.cloud` calls do.
   *
   * @see ../../docs/cloud-projects.md#changing-the-plan
   */
  public async upgrade(
    props: UpgradeCloudPlanProps
  ): Promise<CloudPlanCheckout> {
    return this.validated(
      'upgrade',
      upgradeCloudPlanSchema,
      props,
      async (upgrade) => {
        const subject = 'the plan change';
        const response = await this.cloudClient.request({
          method: 'POST',
          path: PlanService.upgradePath,
          body: JSON.stringify({
            plan: upgrade.plan,
            referenceId: upgrade.organizationId,
            customerType: 'organization',
            successUrl: upgrade.successUrl,
            cancelUrl: upgrade.cancelUrl,
          }),
          subject,
          isSessionRequired: true,
          refusals: [
            {
              status: 403,
              code: 'YOU_ARE_NOT_ALLOWED_TO_MANAGE_THE_PLAN',
              type: 'Unauthorized',
              message: `Only an owner of organization "${upgrade.organizationId}" changes its plan`,
            },
            {
              status: 403,
              code: 'USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION',
              type: 'Unauthorized',
              message: `The account is not a member of organization "${upgrade.organizationId}"`,
            },
            {
              status: 409,
              code: 'PLAN_BELOW_CURRENT_USAGE',
              type: 'Conflict',
              message: `Organization "${upgrade.organizationId}" holds more Projects than the plan has room for`,
            },
          ],
        });
        const checkout = await this.cloudClient.parse(
          response,
          cloudPlanCheckoutSchema,
          subject
        );
        this.logService.info({
          source: 'core',
          message: 'Started a plan change on elek.io Cloud',
          meta: { 'elek.organization.id': upgrade.organizationId },
        });
        return checkout;
      }
    );
  }
}
