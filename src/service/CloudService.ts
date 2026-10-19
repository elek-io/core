import type { AccountService } from './AccountService.js';
import type { CloudProjectService } from './CloudProjectService.js';
import type { OrganizationService } from './OrganizationService.js';
import type { PlanService } from './PlanService.js';
import type { ReportService } from './ReportService.js';

/**
 * The elek.io Cloud APIs, reached as `core.cloud.<api>`: `account` signs in,
 * `organizations`, `projects` and `plans` manage what the account holds on
 * elek.io Cloud, and `reports` sends bug reports and feedback.
 *
 * It owns no behavior of its own, only the second namespace level.
 *
 * @see ../../contributing/naming.md
 * @see ../../docs/cloud-account.md
 * @see ../../docs/cloud-projects.md
 * @see ../../docs/reporting.md
 */
export class CloudService {
  private readonly accountService: AccountService;
  private readonly reportService: ReportService;
  private readonly organizationService: OrganizationService;
  private readonly cloudProjectService: CloudProjectService;
  private readonly planService: PlanService;

  public constructor(
    accountService: AccountService,
    reportService: ReportService,
    organizationService: OrganizationService,
    cloudProjectService: CloudProjectService,
    planService: PlanService
  ) {
    this.accountService = accountService;
    this.reportService = reportService;
    this.organizationService = organizationService;
    this.cloudProjectService = cloudProjectService;
    this.planService = planService;
  }

  /**
   * The account Core is signed in to. Signing in keeps a bearer token in
   * memory for every later call using it, and the User follows the account.
   */
  public get account(): AccountService {
    return this.accountService;
  }

  /**
   * The organizations the account is a member of, with the room each has
   * for another Project, and creating a new one.
   */
  public get organizations(): OrganizationService {
    return this.organizationService;
  }

  /**
   * The Projects on elek.io Cloud, each under the id of a local Project.
   * Not to be confused with `core.projects`, which manages the local ones.
   */
  public get projects(): CloudProjectService {
    return this.cloudProjectService;
  }

  /**
   * The plans of the organizations, which set how many Projects each holds.
   */
  public get plans(): PlanService {
    return this.planService;
  }

  /**
   * The Report API. `core.cloud.reports.create()` is the call that sends a
   * bug report or feedback and returns the id Cloud filed it under.
   */
  public get reports(): ReportService {
    return this.reportService;
  }
}
