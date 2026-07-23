import { describe, expect, it } from 'vitest';
import { buildCredentialEnv, classifyAuthError } from './GitService.js';
import { CoreError } from '../util/shared.js';

describe('buildCredentialEnv', function () {
  it('disables terminal prompts even without a token', function () {
    const env = buildCredentialEnv(null, 'x-access-token', null);

    expect(env).toEqual({ GIT_TERMINAL_PROMPT: '0' });
  });

  it('points GIT_ASKPASS at the helper and passes the token by env', function () {
    const env = buildCredentialEnv(
      'secret-token-123',
      'x-access-token',
      '/tmp/askpass.sh'
    );

    expect(env['GIT_TERMINAL_PROMPT']).toEqual('0');
    expect(env['GIT_ASKPASS']).toEqual('/tmp/askpass.sh');
    expect(env['ELEK_IO_ASKPASS_TOKEN']).toEqual('secret-token-123');
    expect(env['ELEK_IO_ASKPASS_TOKEN_USER']).toEqual('x-access-token');
  });

  it('never places the token into an argument value', function () {
    const env = buildCredentialEnv('secret-token-123', 'user', '/tmp/a.sh');

    expect(env['GIT_ASKPASS']).not.toContain('secret-token-123');
  });

  it('resets configured credential helpers while the token is set', function () {
    const env = buildCredentialEnv('secret-token-123', 'user', '/tmp/a.sh');

    expect(env['GIT_CONFIG_COUNT']).toEqual('1');
    expect(env['GIT_CONFIG_KEY_0']).toEqual('credential.helper');
    expect(env['GIT_CONFIG_VALUE_0']).toEqual('');
  });

  it('keeps ambient credential helpers without a token', function () {
    const env = buildCredentialEnv(null, 'user', null);

    expect(env['GIT_CONFIG_COUNT']).toBeUndefined();
  });
});

describe('classifyAuthError', function () {
  it('returns null for ordinary git errors', function () {
    expect(classifyAuthError('fatal: not a git repository', false)).toBeNull();
    expect(
      classifyAuthError("fatal: couldn't find remote ref work", true)
    ).toBeNull();
  });

  it('classifies a rejected token as Unauthorized', function () {
    const error = classifyAuthError(
      "fatal: Authentication failed for 'https://example.com/repo.git/'",
      true
    );

    expect(error).toBeInstanceOf(CoreError);
    expect(error?.type).toEqual('Unauthorized');
    expect(error?.message).toContain('ELEK_IO_TOKEN');
  });

  it('classifies a disabled prompt without a token as Unauthorized', function () {
    const error = classifyAuthError(
      "fatal: could not read Username for 'https://example.com': terminal prompts disabled",
      false
    );

    expect(error).toBeInstanceOf(CoreError);
    expect(error?.type).toEqual('Unauthorized');
    expect(error?.message).toContain('Set the ELEK_IO_TOKEN');
  });
});
