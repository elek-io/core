import type { AccountService } from './AccountService.js';
import type { ReportService } from './ReportService.js';

/**
 * The elek.io Cloud APIs, reached as `core.cloud.<api>`: `core.cloud.account`
 * signs in to an elek.io account, and `core.cloud.reports` sends bug reports
 * and feedback.
 *
 * It owns no behavior of its own, only the second namespace level.
 *
 * @see ../../contributing/naming.md
 * @see ../../contributing/cloud.md
 */
export class CloudService {
  private readonly accountService: AccountService;
  private readonly reportService: ReportService;

  public constructor(
    accountService: AccountService,
    reportService: ReportService
  ) {
    this.accountService = accountService;
    this.reportService = reportService;
  }

  /**
   * The account Core is signed in to. Signing in keeps a bearer token in
   * memory for every later call using it, and the User follows the account.
   */
  public get account(): AccountService {
    return this.accountService;
  }

  /**
   * The Report API. `core.cloud.reports.create()` is the call that sends a
   * bug report or feedback and returns the id Cloud filed it under.
   */
  public get reports(): ReportService {
    return this.reportService;
  }
}
