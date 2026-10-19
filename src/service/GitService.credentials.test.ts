import { describe, expect, it } from 'vitest';
import { classifyAuthError, classifyLoadError } from '../util/git.js';
import { CoreError } from '../util/shared.js';

describe('classifyAuthError', function () {
  it('returns null for ordinary git errors', function () {
    expect(classifyAuthError('fatal: not a git repository', false)).toBeNull();
    expect(
      classifyAuthError("fatal: couldn't find remote ref draft", true)
    ).toBeNull();
  });

  it('classifies a rejected token as Unauthorized', function () {
    const error = classifyAuthError(
      "fatal: Authentication failed for 'https://example.com/repo.git/'",
      true
    );

    expect(error).toBeInstanceOf(CoreError);
    expect(error?.type).toEqual('Unauthorized');
    expect(error?.message).toContain('ELEK_IO_REMOTE_ACCESS_TOKEN');
  });

  it('classifies a disabled prompt without a token as Unauthorized', function () {
    const error = classifyAuthError(
      "fatal: could not read Username for 'https://example.com': terminal prompts disabled",
      false
    );

    expect(error).toBeInstanceOf(CoreError);
    expect(error?.type).toEqual('Unauthorized');
    expect(error?.message).toContain('Set the ELEK_IO_REMOTE_ACCESS_TOKEN');
  });

  it('classifies a rejected SSH key as Unauthorized naming SSH, not the token', function () {
    const error = classifyAuthError(
      'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.',
      false
    );

    expect(error).toBeInstanceOf(CoreError);
    expect(error?.type).toEqual('Unauthorized');
    expect(error?.message).toContain('SSH');
    expect(error?.message).not.toContain('Set the ELEK_IO_REMOTE_ACCESS_TOKEN');
  });

  it('does not classify an unreachable remote as an auth failure', function () {
    // git prints "Could not read from remote repository." for a rejected
    // key, an unreachable host and a missing repository alike, and dugite
    // maps all three to its SSH permission error
    expect(
      classifyAuthError(
        'ssh: connect to host example.com port 22: Connection refused\nfatal: Could not read from remote repository.',
        false
      )
    ).toBeNull();
    expect(
      classifyAuthError(
        "fatal: '/tmp/gone' does not appear to be a git repository\nfatal: Could not read from remote repository.",
        true
      )
    ).toBeNull();
  });

  it('does not point an SSH failure at the token even when one is set', function () {
    const error = classifyAuthError('fatal: Authentication failed', true);

    expect(error).toBeInstanceOf(CoreError);
    expect(error?.type).toEqual('Unauthorized');
    expect(error?.message).toContain('SSH');
    expect(error?.message).not.toContain('Check ELEK_IO_REMOTE_ACCESS_TOKEN');
  });
});

describe('classifyLoadError', function () {
  it('names a library the loader could not find', function () {
    const error = classifyLoadError(
      "git-remote-https: error while loading shared libraries: libcurl-gnutls.so.4: cannot open shared object file: No such file or directory\nfatal: remote helper 'https' aborted session"
    );

    expect(error?.type).toEqual('PreconditionFailed');
    expect(error?.message).toContain('"libcurl-gnutls.so.4"');
    expect(error?.message).toContain('LOCAL_GIT_DIRECTORY');
  });

  it('names a library whose symbol version does not match', function () {
    const error = classifyLoadError(
      "/opt/git/libexec/git-core/git-remote-https: /lib/libcurl.so.4: version 'CURL_OPENSSL_4' not found (required by /opt/git/libexec/git-core/git-remote-https)"
    );

    expect(error?.message).toContain('"libcurl.so.4"');
  });

  it('matches a localized loader message by the library name', function () {
    const error = classifyLoadError(
      'git-remote-https: Fehler beim Laden gemeinsamer Bibliotheken: libcurl-gnutls.so.4: Kann die Shared-Object-Datei nicht öffnen'
    );

    expect(error?.message).toContain('"libcurl-gnutls.so.4"');
  });

  it('leaves every other failure alone', function () {
    expect(
      classifyLoadError(
        "fatal: repository 'https://example.com/a.git/' not found"
      )
    ).toBeNull();
    expect(classifyLoadError('fatal: not a git repository')).toBeNull();
  });
});
