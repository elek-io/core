import Os from 'node:os';
import {
  createReportSchema,
  reportRequestSchema,
  reportResponseSchema,
  serviceTypeSchema,
  type CreateReportProps,
  type ElekIoCoreOptions,
  type ReportResponse,
} from '../schema/index.js';
import type { CloudClient } from '../util/cloud.js';
import type { PathTo } from '../util/node.js';
import { CoreError } from '../util/shared.js';
import { AbstractService } from './AbstractService.js';
import type { LogService } from './LogService.js';

/**
 * Sends a bug report or feedback to elek.io Cloud
 *
 * Core fills in exactly two things: the machine it is running on, and the
 * log tail when a bug report consented to attaching one. Everything else
 * passes through from the caller, validated. Who sent it is deliberately
 * not read from `user.get()` here, because the address somebody can be
 * reached at is editable in the form that collected the report.
 *
 * @see ../../docs/reporting.md
 */
export class ReportService extends AbstractService {
  /** Appended to the configured Cloud URL, which never ends in a slash */
  private static readonly path = '/management/v1/reports';

  /**
   * Ceiling on the serialized body, checked before it is sent.
   *
   * Base64 inflates a gzipped tail by a third, so the 1 MB a log blob may
   * be is 1.33 MB here. Refusing locally beats letting Cloud answer 413,
   * since the caller learns the same thing without the round trip.
   */
  private static readonly maxBytes = 2 * 1024 * 1024;

  private readonly coreVersion: string;
  private readonly cloudClient: CloudClient;

  public constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService,
    cloudClient: CloudClient
  ) {
    super(serviceTypeSchema.enum.Report, options, pathTo, logService);

    this.coreVersion = coreVersion;
    this.cloudClient = cloudClient;
  }

  /**
   * Sends a report and returns the id elek.io Cloud filed it under.
   *
   * Throws `BadRequest` for a rejected or over-2 MB body, `Unauthorized`,
   * where a 401 also forgets the token it carried, `RateLimited`,
   * `PreconditionFailed` when Cloud is unreachable or silent for 15 seconds,
   * and `Internal` otherwise. Read-only mode does not block it, and Core
   * never retries, so sending again after a timeout can duplicate a report.
   *
   * @see ../../docs/reporting.md
   */
  public async create(props: CreateReportProps): Promise<ReportResponse> {
    // validated() rather than mutating(): assertNotReadOnly protects a
    // Project and its remote, and a report mutates nothing local. Being
    // unable to write is a reason to send one, not a reason to refuse it
    return this.validated(
      'create',
      createReportSchema,
      props,
      async (report) => {
        // The parse is what drops hasLogConsent: it is consent to attaching
        // a tail rather than part of the report, so the request never
        // carried it and `logs` is the answer to it
        const parsed = reportRequestSchema.safeParse({
          ...report,
          core: {
            version: this.coreVersion,
            // The Node spellings, not the `os.type` and `host.arch` a log
            // record carries. This is the machine, not a log record
            platform: process.platform,
            arch: process.arch,
            osRelease: Os.release(),
          },
          logs:
            report.type === 'bug' && report.hasLogConsent
              ? await this.logService.tail()
              : null,
        });
        // What the caller passed was validated on the way in, so only what
        // Core added can fail here: a tail too large for the contract, or a
        // machine value outside it, which Node and the kernel already bound
        if (parsed.success === false) {
          throw CoreError.badRequest(parsed.error.message, parsed.error);
        }
        const request = parsed.data;

        const body = JSON.stringify(request);
        const bytes = Buffer.byteLength(body, 'utf8');
        if (bytes > ReportService.maxBytes) {
          throw CoreError.badRequest(
            `Cannot send a report of ${bytes} bytes because the limit is ${ReportService.maxBytes}`
          );
        }

        const response = await this.cloudClient.request({
          method: 'POST',
          path: ReportService.path,
          body,
          subject: 'the report',
        });
        return await this.cloudClient.parse(
          response,
          reportResponseSchema,
          'the report'
        );
      }
    );
  }
}
