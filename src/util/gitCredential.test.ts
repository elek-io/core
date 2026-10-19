import { execFileSync } from 'node:child_process';
import Fs from 'fs-extra';
import Path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tmpDirPath } from '../test/util.js';
import {
  CREDENTIAL_HELPER_SCRIPT,
  QUIT_ANSWER,
  credentialConfig,
  credentialHelperCommand,
  formatCredentialAnswer,
  gitConfigParameters,
  parseCredentialRequest,
  parseRelayMessage,
  projectIdOfCredentialPath,
  shellQuote,
} from './gitCredential.js';
import { uuid } from './shared.js';

describe('parseCredentialRequest', function () {
  it('reads the keys Core uses and skips what git-lfs adds', function () {
    const request = parseCredentialRequest(
      [
        'capability[]=authtype',
        'capability[]=state',
        'protocol=https',
        'host=cell-1.git.elek.io',
        'path=projects/abc.git',
        'wwwauth[]=Basic realm="git"',
        'username=git',
        'password=a=b',
        '',
      ].join('\n')
    );

    expect(request).toEqual({
      protocol: 'https',
      host: 'cell-1.git.elek.io',
      path: 'projects/abc.git',
      username: 'git',
      password: 'a=b',
    });
  });

  it('answers null for what git left out', function () {
    expect(
      parseCredentialRequest('protocol=https\nhost=example.com\n')
    ).toEqual({
      protocol: 'https',
      host: 'example.com',
      path: null,
      username: null,
      password: null,
    });
  });
});

describe('formatCredentialAnswer', function () {
  it('writes one value per line', function () {
    expect(formatCredentialAnswer('git', 'token-1')).toEqual(
      'username=git\npassword=token-1\n'
    );
  });

  it('refuses a value that would add a line to the protocol', function () {
    expect(formatCredentialAnswer('git', 'token\nquit=1')).toBeNull();
    expect(formatCredentialAnswer('git\r', 'token')).toBeNull();
    expect(formatCredentialAnswer('git', 'tok\0en')).toBeNull();
  });
});

describe('projectIdOfCredentialPath', function () {
  const id = uuid();

  it('reads the Project id of a Cloud remote', function () {
    expect(projectIdOfCredentialPath(`projects/${id}.git`)).toEqual(id);
    expect(projectIdOfCredentialPath(`projects/${id}`)).toEqual(id);
    expect(projectIdOfCredentialPath(`projects/${id}.git/info/lfs`)).toEqual(
      id
    );
  });

  it('answers null for any other path', function () {
    expect(projectIdOfCredentialPath(null)).toBeNull();
    expect(projectIdOfCredentialPath('')).toBeNull();
    expect(projectIdOfCredentialPath(`${id}.git`)).toBeNull();
    expect(projectIdOfCredentialPath('projects/not-a-uuid.git')).toBeNull();
    expect(projectIdOfCredentialPath(`projects/${id}.git/x/y`)).toBeNull();
    expect(projectIdOfCredentialPath(`other/${id}.git`)).toBeNull();
  });
});

describe('gitConfigParameters', function () {
  it('quotes keys and values the way git reads them', function () {
    expect(
      gitConfigParameters([
        ['credential.helper', ''],
        ['credential.https://*.git.elek.io.helper', "!'/a b/node' x"],
      ])
    ).toEqual(
      "'credential.helper'='' 'credential.https://*.git.elek.io.helper'='!'\\''/a b/node'\\'' x'"
    );
  });

  it('survives a single quote in a path', function () {
    expect(shellQuote("/home/o'brien")).toEqual("'/home/o'\\''brien'");
  });
});

describe('credentialHelperCommand', function () {
  it('runs the relay script with Node as a shell snippet', function () {
    expect(
      credentialHelperCommand({
        execPath: '/usr/bin/node',
        scriptPath: '/data dir/tmp/git-credential.cjs',
        mode: 'cloud',
        isElectron: false,
      })
    ).toEqual("!'/usr/bin/node' '/data dir/tmp/git-credential.cjs' cloud");
  });

  it('runs an Electron app as Node', function () {
    expect(
      credentialHelperCommand({
        execPath: '/opt/elek.io/elek.io',
        scriptPath: '/tmp/h.cjs',
        mode: 'token',
        isElectron: true,
      })
    ).toEqual(
      "!ELECTRON_RUN_AS_NODE=1 '/opt/elek.io/elek.io' '/tmp/h.cjs' token"
    );
  });
});

describe('credentialConfig', function () {
  const helper = (mode: string) => `helper-${mode}`;

  it('scopes the helper to the Cloud pattern, after an empty helper', function () {
    expect(
      credentialConfig({
        cloudGitUrl: 'https://*.git.elek.io',
        hasRemoteToken: false,
        helper,
      })
    ).toEqual([
      ['credential.https://*.git.elek.io.helper', ''],
      ['credential.https://*.git.elek.io.helper', 'helper-cloud'],
      ['credential.https://*.git.elek.io.useHttpPath', 'true'],
    ]);
  });

  it('answers every host with the remote token, and Cloud hosts last', function () {
    expect(
      credentialConfig({
        cloudGitUrl: 'http://localhost:3300',
        hasRemoteToken: true,
        helper,
      })
    ).toEqual([
      ['credential.helper', ''],
      ['credential.helper', 'helper-token'],
      ['credential.http://localhost:3300.helper', ''],
      ['credential.http://localhost:3300.helper', 'helper-cloud'],
      ['credential.http://localhost:3300.useHttpPath', 'true'],
    ]);
  });

  it('leaves the person their own helpers without either', function () {
    expect(
      credentialConfig({ cloudGitUrl: null, hasRemoteToken: false, helper })
    ).toEqual([]);
  });
});

describe('parseRelayMessage', function () {
  it('splits off the three header lines and keeps the request whole', function () {
    expect(
      parseRelayMessage('t\ncloud\nget\nprotocol=https\nhost=a\n')
    ).toEqual({
      token: 't',
      mode: 'cloud',
      action: 'get',
      input: 'protocol=https\nhost=a\n',
    });
  });

  it('answers null for a message cut short', function () {
    expect(parseRelayMessage('t\ncloud')).toBeNull();
  });

  it('keeps quit=1 in the one place git reads it from', function () {
    expect(QUIT_ANSWER).toEqual('quit=1\n');
  });
});

describe('CREDENTIAL_HELPER_SCRIPT', function () {
  /** Runs the helper as git would, with no relay to reach */
  async function runWithoutRelay(action: string): Promise<string> {
    const dir = tmpDirPath();
    const script = Path.join(dir, 'helper.cjs');
    await Fs.outputFile(script, CREDENTIAL_HELPER_SCRIPT);
    const env = { ...process.env };
    delete env['ELEK_IO_CREDENTIAL_PORT'];
    delete env['ELEK_IO_CREDENTIAL_TOKEN'];
    return execFileSync(process.execPath, [script, 'cloud', action], {
      input: 'protocol=https\nhost=cell-1.git.example.test\n\n',
      env,
      encoding: 'utf8',
    });
  }

  it('answers get with exactly quit=1 when it cannot reach the relay', async function () {
    expect(await runWithoutRelay('get')).toEqual(QUIT_ANSWER);
  });

  it('answers store and erase with nothing', async function () {
    expect(await runWithoutRelay('store')).toEqual('');
    expect(await runWithoutRelay('erase')).toEqual('');
  });
});
