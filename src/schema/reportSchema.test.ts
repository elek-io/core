import { describe, expect, it } from 'vitest';
import {
  createBugReportSchema,
  createFeedbackReportSchema,
  createReportSchema,
  reportRequestSchema,
  reportResponseSchema,
  type CreateReportBase,
  type CreateReportProps,
} from './reportSchema.js';
import { uuid } from '../util/shared.js';

/**
 * These schemas are a contract with two repositories that cannot see this
 * one at build time. elek.io Desktop imports them into its renderer and
 * derives its form copy and its field caps from them, and elek.io Cloud is
 * built against the request they describe. So what is asserted here is the
 * shape someone else already wrote code against, not an implementation.
 */
// Derived rather than a named export, since Desktop is the only thing
// that builds one and it can name it itself
const desktop: CreateReportBase['desktop'] = {
  version: '0.5.0',
  runtime: { electron: '40.1.0', chrome: '142.0.0.0', node: '24.12.0' },
};

const localUser = {
  name: 'Nils',
  email: 'me@example.com',
  userType: 'local',
  language: 'en',
  id: null,
};

const cloudUser = {
  ...localUser,
  userType: 'cloud',
  id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
};

const bug = {
  type: 'bug',
  message: 'Deleting a Collection spins forever after confirming the dialog.',
  user: localUser,
  desktop,
  hasLogConsent: true,
};

const feedback = {
  type: 'feedback',
  message: 'The Release view is the best part of this.',
  user: localUser,
  desktop,
};

describe('what a client asks Core to send', function () {
  it('takes a bug with everything the dialog collects', function () {
    expect(createReportSchema.safeParse(bug).success).toBe(true);
  });

  it('takes feedback, which never attaches logs', function () {
    expect(createReportSchema.safeParse(feedback).success).toBe(true);
  });

  it('discriminates on the type, so a bug without its own fields is rejected', function () {
    const { hasLogConsent: _hasLogConsent, ...withoutLogConsent } = bug;

    expect(createReportSchema.safeParse(withoutLogConsent).success).toBe(false);
  });

  it('makes a bug report say whether to attach logs, never assuming it', function () {
    // Consent to sending a log file, so there is no such thing as a default
    expect(
      createReportSchema.safeParse({ ...bug, hasLogConsent: false }).success
    ).toBe(true);
  });

  it('holds a User to what they typed being worth reading', function () {
    expect(
      createReportSchema.safeParse({ ...bug, message: 'too short' }).success
    ).toBe(false);
    expect(
      createReportSchema.safeParse({ ...bug, message: 'x'.repeat(5001) })
        .success
    ).toBe(false);
  });

  it('exposes the cap as maxLength, which is what a counter reads', function () {
    // Read off the schema rather than hand-copied, so a cap that changes
    // here cannot drift from the number under a field
    expect(createBugReportSchema.shape.message.maxLength).toBe(5000);
    expect(createFeedbackReportSchema.shape.message.maxLength).toBe(5000);
  });

  it('says which bound a message missed, which is what that counter shows', function () {
    expect(messageFor({ ...bug, message: 'short' })).toBe(
      'Too small: expected string to have >=10 characters'
    );
    expect(messageFor({ ...bug, message: 'x'.repeat(5001) })).toBe(
      'Too big: expected string to have <=5000 characters'
    );
  });
});

describe('the Desktop block, which Core cannot know', function () {
  it('takes what elek.io Desktop hands over', function () {
    expect(createReportSchema.safeParse(bug).success).toBe(true);
  });

  it('wants all three runtime versions, not whichever ones turned up', function () {
    const { chrome: _chrome, ...withoutChrome } = desktop.runtime;

    expect(
      createReportSchema.safeParse({
        ...bug,
        desktop: { ...desktop, runtime: withoutChrome },
      }).success
    ).toBe(false);
  });

  it('takes the placeholder Desktop sends for a version it could not read', function () {
    expect(
      createReportSchema.safeParse({
        ...bug,
        desktop: {
          ...desktop,
          runtime: { ...desktop.runtime, electron: 'unknown' },
        },
      }).success
    ).toBe(true);
  });

  it('takes a Chrome version, which has four segments rather than three', function () {
    expect(desktop.runtime.chrome.split('.')).toHaveLength(4);
    expect(createReportSchema.safeParse(bug).success).toBe(true);
  });

  it('holds Desktop to a real version of itself', function () {
    expect(
      createReportSchema.safeParse({
        ...bug,
        desktop: { ...desktop, version: 'latest' },
      }).success
    ).toBe(false);
  });
});

describe('who a report is from', function () {
  it('takes the User whose machine it was sent from', function () {
    expect(createReportSchema.safeParse(bug).success).toBe(true);
    expect(
      createReportSchema.safeParse({ ...bug, user: cloudUser }).success
    ).toBe(true);
  });

  it('takes a report sent before a User exists', function () {
    // Desktop keeps the button reachable on a broken first run, which is
    // exactly when a report is worth having
    expect(createReportSchema.safeParse({ ...bug, user: null }).success).toBe(
      true
    );
  });

  it('rules out a sender no User could be', function () {
    // The kind and the account are not independent, and the User schema
    // already says so
    expect(
      createReportSchema.safeParse({
        ...bug,
        user: { ...localUser, id: cloudUser.id },
      }).success
    ).toBe(false);
    expect(
      createReportSchema.safeParse({ ...bug, user: { ...cloudUser, id: null } })
        .success
    ).toBe(false);
  });

  it('does not let a sender say their own identity was verified', function () {
    // Once Cloud sign-in exists, a request either carries a session or it
    // does not, and the credential is what says whether a sender is who
    // they claim. A field in the body saying so is one somebody believes
    for (const user of [localUser, cloudUser]) {
      const parsed = createReportSchema.parse({
        ...bug,
        user: { ...user, isVerified: true },
      });

      expect(parsed.user).not.toHaveProperty('isVerified');
    }
  });

  it('carries the User and leaves the settings of their machine behind', function () {
    // A User is identity now that localApi lives on userSettingsSchema. The
    // port the local API binds on somebody's machine is not part of one and
    // a report is no reason to send it
    const parsed = createReportSchema.parse({
      ...bug,
      user: { ...localUser, localApi: { isEnabled: true, port: 31310 } },
    });

    expect(Object.keys(parsed.user ?? {}).toSorted()).toEqual([
      'email',
      'id',
      'language',
      'name',
      'userType',
    ]);
  });

  // Every field on its own, because a fixture wrong in two ways passes for
  // either reason
  it.each([
    ['an email that is not an address', { email: 'not an address' }],
    ['a name a git signature could not carry', { name: 'Nils | elek.io' }],
    ['an id that is not null', { id: 'nope' }],
    ['a userType nobody has', { userType: 'admin' }],
    ['no language, which every User has', { language: undefined }],
  ])('rejects a local sender with %s', function (_reason, wrong) {
    expect(
      createReportSchema.safeParse({ ...bug, user: { ...localUser, ...wrong } })
        .success
    ).toBe(false);
  });

  // The other half of the union, which the cases above never reach
  it.each([
    ['no id, which every Cloud User has', { id: undefined }],
    ['an id that is not a uuid', { id: 'nope' }],
    ['no language, which every User has', { language: undefined }],
  ])('rejects a Cloud sender with %s', function (_reason, wrong) {
    expect(
      createReportSchema.safeParse({ ...bug, user: { ...cloudUser, ...wrong } })
        .success
    ).toBe(false);
  });
});

describe('the request elek.io Cloud is built against', function () {
  const request = {
    type: 'bug',
    message: 'Deleting a Collection spins forever after confirming the dialog.',
    user: localUser,
    desktop,
    core: {
      version: '0.24.0',
      platform: 'linux',
      arch: 'x64',
      osRelease: '6.19.14',
    },
    logs: {
      encoding: 'gzip+base64',
      from: '2026-08-20T14:02:11.000Z',
      to: '2026-08-21T14:02:11.000Z',
      isTruncated: false,
      data: 'H4sIAAAA',
    },
  };

  it('carries what the User wrote, who they are, and what Core is', function () {
    expect(reportRequestSchema.safeParse(request).success).toBe(true);
  });

  it('holds the same cap a client validated against, from the same place', function () {
    // The request extends the base the create schemas do, so a cap cannot
    // be raised for a form and left where it was on the wire
    expect(reportRequestSchema.shape.message.maxLength).toBe(
      createBugReportSchema.shape.message.maxLength
    );
    expect(
      reportRequestSchema.safeParse({ ...request, message: 'x'.repeat(5001) })
        .success
    ).toBe(false);
  });

  it('validates the Desktop block rather than passing it along', function () {
    const { desktop: _desktop, ...withoutDesktop } = request;

    expect(reportRequestSchema.safeParse(withoutDesktop).success).toBe(false);
  });

  it('accepts a report with no logs attached, which is the default', function () {
    expect(
      reportRequestSchema.safeParse({ ...request, logs: null }).success
    ).toBe(true);
  });

  it('wants the machine Core is running on, which only Core knows', function () {
    const { core: _core, ...withoutCore } = request;

    expect(reportRequestSchema.safeParse(withoutCore).success).toBe(false);
    expect(
      reportRequestSchema.safeParse({
        ...request,
        core: { ...request.core, osRelease: undefined },
      }).success
    ).toBe(false);
  });
});

describe('what elek.io Cloud answers with', function () {
  it('parses a created report', function () {
    expect(reportResponseSchema.safeParse({ id: uuid() }).success).toBe(true);
  });

  it('rejects a body that only looks like one', function () {
    // A 201 whose body does not match is an Internal error rather than
    // something handed back to a caller unvalidated
    expect(reportResponseSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(
      false
    );
    expect(reportResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe('the types the renderer imports', function () {
  it('narrows a report by its type', function () {
    const report: CreateReportProps = createReportSchema.parse(bug);

    if (report.type === 'bug') {
      expect(report.hasLogConsent).toBe(true);
    } else {
      expect.unreachable('the bug fixture is a bug report');
    }
  });
});

function messageFor(value: unknown): string | undefined {
  const result = createBugReportSchema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}
