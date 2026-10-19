import { describe, expect, it } from 'vitest';
import { upgradeCloudPlanSchema } from '../schema/cloudPlanSchema.js';
import { refused, startFakeCloud, type Respond } from '../test/cloud.js';
import { caughtCoreError, createTmpCore } from '../test/util.js';
import { uuid } from '../util/shared.js';

/**
 * Changing an organization's plan, against a real HTTP server standing in
 * for elek.io Cloud. The test box runs placeholder payment keys, so this
 * suite is the only place a successful upgrade is seen.
 */

const upgradeRoute = 'POST /api/auth/subscription/upgrade';
const token = 'session-token';
const organizationId = uuid();
const checkoutUrl = 'https://checkout.example.test/c/pay/cs_test_a1';

const upgrade = {
  organizationId,
  plan: 'pro',
  successUrl: 'https://app.elek.io/billing/success',
  cancelUrl: '/billing/cancel',
} as const;

async function signedIn(respond: Respond) {
  const cloud = await startFakeCloud({ [upgradeRoute]: respond });
  const { core } = createTmpCore({ cloud: { url: cloud.url, token } });
  return { cloud, core };
}

describe('upgrading a plan', function () {
  it('sends the plan for the organization and answers the page to open', async function () {
    const { cloud, core } = await signedIn(() =>
      Response.json({ url: checkoutUrl, redirect: true })
    );

    expect(await core.cloud.plans.upgrade(upgrade)).toEqual({
      url: checkoutUrl,
    });
    expect(cloud.received[0]?.body).toEqual({
      plan: 'pro',
      referenceId: organizationId,
      customerType: 'organization',
      successUrl: 'https://app.elek.io/billing/success',
      cancelUrl: '/billing/cancel',
    });
    expect(cloud.received[0]?.headers['authorization']).toBe(`Bearer ${token}`);
  });

  it.each(['hobby', 'galactic'])(
    'takes only a plan with a price, so not %s',
    function (plan) {
      expect(
        upgradeCloudPlanSchema.safeParse({ ...upgrade, plan }).success
      ).toBe(false);
    }
  );

  it.each([
    ['a protocol relative URL', { successUrl: '//evil.example.test/' }],
    ['a relative path without a slash', { cancelUrl: 'billing/cancel' }],
    ['an organization id that is not a uuid', { organizationId: 'acme' }],
  ])('refuses %s before anything is sent', async function (_, change) {
    const { cloud, core } = await signedIn(() =>
      Response.json({ url: checkoutUrl })
    );

    const error = await caughtCoreError(
      core.cloud.plans.upgrade({ ...upgrade, ...change })
    );

    expect(error.type).toBe('BadRequest');
    expect(cloud.received).toHaveLength(0);
  });

  it.each([
    [403, 'YOU_ARE_NOT_ALLOWED_TO_MANAGE_THE_PLAN', 'Unauthorized', 'owner'],
    [403, 'USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION', 'Unauthorized', 'member'],
    [409, 'PLAN_BELOW_CURRENT_USAGE', 'Conflict', 'more Projects'],
  ])(
    'turns a %i %s into %s, keeping the session',
    async function (status, code, type, text) {
      const { core } = await signedIn(() => refused(status, code));

      const error = await caughtCoreError(core.cloud.plans.upgrade(upgrade));

      expect(error.type).toBe(type);
      expect(error.message).toContain(text);
      expect(error.message).not.toContain(code);
      expect(core.cloud.account.hasToken).toBe(true);
    }
  );

  it('forgets the session on a 401, which a 403 never means here', async function () {
    const { core } = await signedIn(() => refused(401, 'UNAUTHORIZED'));

    const error = await caughtCoreError(core.cloud.plans.upgrade(upgrade));

    expect(error.type).toBe('Unauthorized');
    expect(core.cloud.account.hasToken).toBe(false);
  });

  it('says when to try again after a 429', async function () {
    const { core } = await signedIn(() =>
      refused(429, 'rate_limited', { headers: { 'Retry-After': '60' } })
    );

    const error = await caughtCoreError(core.cloud.plans.upgrade(upgrade));

    expect(error.type).toBe('RateLimited');
    expect(error.retryAt).toBeGreaterThan(Date.now() + 50_000);
  });

  it('throws Internal for a page that is not http or https', async function () {
    const { core } = await signedIn(() =>
      Response.json({ url: 'javascript:alert(1)' })
    );

    const error = await caughtCoreError(core.cloud.plans.upgrade(upgrade));

    expect(error.type).toBe('Internal');
  });

  it('throws Unauthorized without a session, sending nothing', async function () {
    const cloud = await startFakeCloud({
      [upgradeRoute]: () => Response.json({ url: checkoutUrl }),
    });
    const { core } = createTmpCore({ cloud: { url: cloud.url } });

    const error = await caughtCoreError(core.cloud.plans.upgrade(upgrade));

    expect(error.type).toBe('Unauthorized');
    expect(cloud.received).toHaveLength(0);
  });
});
