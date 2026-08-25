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
import type { PathTo } from '../util/node.js';
import { CoreError } from '../util/shared.js';
import { AbstractService } from './AbstractService.js';
import type { LogService } from './LogService.js';

/** Appended to the configured Cloud URL, which never ends in a slash */
const REPORT_PATH = '/management/v1/reports';

/**
 * How long Core waits for an answer before giving up.
 *
 * There is no retry behind this. A retry after a timeout can duplicate a
 * report elek.io Cloud already accepted and Core cannot tell the
 * difference, so a timeout is handed back and sending again is the
 * User's decision.
 */
const REPORT_TIMEOUT_MS = 15_000;

/**
 * Ceiling on the serialized body, checked before it is sent.
 *
 * Base64 inflates a gzipped tail by a third, so the 1 MB a log blob may
 * be is 1.33 MB here. Refusing locally beats letting Cloud answer 413,
 * since the caller learns the same thing without the round trip.
 */
const REPORT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Sends a bug report or feedback to elek.io Cloud
 *
 * Core fills in exactly two things: the machine it is running on, and the
 * log tail when a bug report consented to attaching one. Everything else
 * passes through from the caller, validated. Who sent it is deliberately
 * not read from `user.get()` here, because the address somebody can be
 * reached at is editable in the form that collected the report.
 *
 * See docs/reporting.md.
 */
export class ReportService extends AbstractService {
  private readonly coreVersion: string;

  public constructor(
    coreVersion: string,
    options: ElekIoCoreOptions,
    pathTo: PathTo,
    logService: LogService
  ) {
    super(serviceTypeSchema.enum.Report, options, pathTo, logService);

    this.coreVersion = coreVersion;
  }

  /**
   * Sends a report and returns the id elek.io Cloud filed it under
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
        // The parse is what drops includeLogs: it is consent to attaching
        // a tail rather than part of the report, so the request never
        // carried it and `logs` is the answer to it
        const request = reportRequestSchema.parse({
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
            report.type === 'bug' && report.includeLogs
              ? await this.logService.tail()
              : null,
        });

        const body = JSON.stringify(request);
        const bytes = Buffer.byteLength(body, 'utf8');
        if (bytes > REPORT_MAX_BYTES) {
          throw CoreError.badRequest(
            `Cannot send a report of ${bytes} bytes because the limit is ${REPORT_MAX_BYTES}`
          );
        }

        const url = `${this.options.cloud.url}${REPORT_PATH}`;
        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': `elek.io-core/${this.coreVersion}`,
            },
            body,
            signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
          });
        } catch (error) {
          throw CoreError.preconditionFailed(
            `Could not reach elek.io Cloud at "${url}"`,
            error
          );
        }

        if (response.ok === false) {
          throw ReportService.errorForStatus(response.status, url);
        }

        return await ReportService.parseResponse(response);
      }
    );
  }

  /**
   * Maps what elek.io Cloud answered onto the error types a caller
   * switches on.
   *
   * The answer's own body is deliberately not read into the message. It
   * can echo back what was sent, and a boundary error message is written
   * to a log file, which is the one place a report must never reach.
   */
  private static errorForStatus(status: number, url: string): CoreError {
    const detail = `elek.io Cloud answered ${status} for the report sent to "${url}"`;

    switch (status) {
      // The body was rejected, which is something a caller can act on
      case 400:
      case 413:
        return CoreError.badRequest(detail);
      // No credential, or one that does not carry this
      case 401:
      case 403:
        return CoreError.unauthorized(detail);
      case 429:
        return CoreError.rateLimited(detail);
      // 5xx, and anything else nobody planned for. Not a caller's to fix
      default:
        return CoreError.internal(detail);
    }
  }

  /**
   * Parses an accepted report, or throws rather than handing a caller
   * something unvalidated
   */
  private static async parseResponse(
    response: Response
  ): Promise<ReportResponse> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw CoreError.internal(
        'elek.io Cloud accepted the report but did not answer with JSON',
        error
      );
    }

    const parsed = reportResponseSchema.safeParse(payload);
    if (parsed.success === false) {
      throw CoreError.internal(
        `elek.io Cloud accepted the report but answered with something else: ${parsed.error.message}`,
        parsed.error
      );
    }

    return parsed.data;
  }
}
