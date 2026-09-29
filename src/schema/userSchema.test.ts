import { describe, expect, it } from 'vitest';
import {
  cloudUserSchema,
  localUserSchema,
  userFileSchema,
  userSettingsSchema,
} from './userSchema.js';
import { uuid } from '../util/shared.js';

/**
 * A User is who elek.io signs a commit as and who a report comes from, and
 * the file on disk is that plus how this machine is set up. The split is
 * what lets the identity be sent somewhere while the settings stay put.
 */
const identity = {
  name: 'John Doe',
  email: 'john.doe@test.com',
  language: 'en',
};

const settings = { localApi: { isEnabled: false, port: 31310 } };

describe('the two kinds of User', function () {
  it('gives a local User an empty account, not a missing one', function () {
    // The key is there either way, so reading it never needs the kind
    // checked first
    const parsed = localUserSchema.parse({
      ...identity,
      userType: 'local',
      id: null,
    });

    expect(parsed.id).toBe(null);
  });

  it('will not let a local User carry an account id', function () {
    expect(
      localUserSchema.safeParse({
        ...identity,
        userType: 'local',
        id: uuid(),
      }).success
    ).toBe(false);
  });

  it('will not let a local User leave the account out either', function () {
    expect(
      localUserSchema.safeParse({ ...identity, userType: 'local' }).success
    ).toBe(false);
  });

  it('gives a Cloud User the account they signed in with', function () {
    const id = uuid();
    const parsed = cloudUserSchema.parse({
      ...identity,
      userType: 'cloud',
      id,
    });

    expect(parsed.id).toBe(id);
  });

  it('will not let a Cloud User be without one', function () {
    expect(
      cloudUserSchema.safeParse({ ...identity, userType: 'cloud', id: null })
        .success
    ).toBe(false);
    expect(
      cloudUserSchema.safeParse({ ...identity, userType: 'cloud' }).success
    ).toBe(false);
  });
});

describe('a User and the machine they use it on', function () {
  it('keeps the settings of a machine out of who somebody is', function () {
    // What makes a User safe to put in a report: nothing in one describes
    // the machine it was set up on
    const parsed = localUserSchema.parse({
      ...identity,
      userType: 'local',
      id: null,
      ...settings,
    });

    expect(parsed).not.toHaveProperty('localApi');
  });

  it('is both of them together in the file on disk', function () {
    const file = { ...identity, userType: 'local', id: null, ...settings };

    expect(userFileSchema.safeParse(file).success).toBe(true);
    expect(userFileSchema.parse(file)).toHaveProperty('localApi');
  });

  it('is not a file without them', function () {
    expect(
      userFileSchema.safeParse({
        ...identity,
        userType: 'local',
        id: null,
      }).success
    ).toBe(false);
  });

  it('names the settings on their own, so both kinds carry the same ones', function () {
    expect(Object.keys(userSettingsSchema.shape)).toEqual(['localApi']);
    expect(userSettingsSchema.safeParse(settings).success).toBe(true);
  });
});
