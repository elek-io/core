import type { ReportService } from './ReportService.js';

/**
 * The elek.io Cloud APIs, reached as `core.cloud.<api>`. Today that is
 * `core.cloud.reports` alone, which sends bug reports and feedback.
 *
 * It owns no behavior of its own, only the second namespace level.
 *
 * @see ../../contributing/naming.md
 * @see ../../docs/reporting.md
 */
export class CloudService {
  private readonly reportService: ReportService;

  public constructor(reportService: ReportService) {
    this.reportService = reportService;
  }

  /**
   * Sends a bug report or feedback to elek.io Cloud
   */
  public get reports(): ReportService {
    return this.reportService;
  }
}
