import { exec as gitExec } from 'dugite';
import Fs from 'fs-extra';
import Path from 'node:path';
import { tmpDirPath } from './util.js';

/** The person's own credential setup, recording whether git asked it */
export interface CredentialRecorder {
  /** A global git config whose only helper is the keychain stand-in */
  globalConfig: string;
  /** An empty global git config, for a run without the keychain */
  emptyConfig: string;
  /** A program git runs as `GIT_ASKPASS` or `SSH_ASKPASS` */
  askpass: string;
  /** Every request in order, `keychain <action>` or `askpass <prompt>` */
  recorded: () => Promise<string[]>;
}

/**
 * A keychain stand-in, a credential helper in a global config that answers
 * `person` and `keychain-secret`, and an askpass that answers
 * `askpass-secret`. Both record every request, so a test asserts what
 * reached them rather than what Core believes it configured.
 */
export async function createCredentialRecorder(): Promise<CredentialRecorder> {
  const dir = tmpDirPath();
  await Fs.ensureDir(dir);
  const log = Path.join(dir, 'recorded.log');

  const helper = Path.join(dir, 'keychain.cjs');
  await Fs.writeFile(
    helper,
    [
      "const fs = require('node:fs');",
      'const action = process.argv[process.argv.length - 1];',
      "process.stdin.on('data', () => undefined);",
      "process.stdin.on('end', () => {",
      `  fs.appendFileSync(${JSON.stringify(log)}, 'keychain ' + action + '\\n');`,
      "  if (action === 'get') process.stdout.write('username=person\\npassword=keychain-secret\\n');",
      '});',
      '',
    ].join('\n')
  );
  const globalConfig = Path.join(dir, 'gitconfig');
  const emptyConfig = Path.join(dir, 'empty.gitconfig');
  await Fs.writeFile(globalConfig, '');
  await Fs.writeFile(emptyConfig, '');
  const configured = await gitExec(
    [
      'config',
      '--file',
      globalConfig,
      'credential.helper',
      `!'${process.execPath}' '${helper}'`,
    ],
    dir
  );
  if (configured.exitCode !== 0) {
    throw new Error(`git config failed: ${configured.stderr}`);
  }

  const askpassScript = Path.join(dir, 'askpass.cjs');
  await Fs.writeFile(
    askpassScript,
    `require('node:fs').appendFileSync(${JSON.stringify(log)}, 'askpass ' + process.argv[2] + '\\n'); process.stdout.write('askpass-secret\\n');\n`
  );
  let askpass: string;
  if (process.platform === 'win32') {
    askpass = Path.join(dir, 'askpass.bat');
    await Fs.writeFile(
      askpass,
      `@echo off\r\n"${process.execPath}" "${askpassScript}" %*\r\n`
    );
  } else {
    askpass = Path.join(dir, 'askpass.sh');
    await Fs.writeFile(
      askpass,
      `#!/bin/sh\nexec "${process.execPath}" "${askpassScript}" "$@"\n`,
      { mode: 0o700 }
    );
  }

  return {
    globalConfig,
    emptyConfig,
    askpass,
    recorded: async function () {
      if ((await Fs.pathExists(log)) === false) {
        return [];
      }
      return (await Fs.readFile(log, 'utf8')).split('\n').filter(Boolean);
    },
  };
}
