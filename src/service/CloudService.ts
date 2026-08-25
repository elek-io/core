import type { ReportService } from './ReportService.js';

/**
 * Everything Core does against elek.io Cloud
 *
 * The one place in Core that is two levels deep, and deliberately.
 * elek.io Cloud is several APIs rather than one, so `core.cloud.reports`
 * names which of them a call belongs to and leaves the Management and
 * Publish surfaces somewhere to land without renaming anything.
 *
 * See docs/reporting.md.
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
