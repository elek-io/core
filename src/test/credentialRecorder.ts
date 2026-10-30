import Fs from 'fs-extra';
import Path from 'node:path';
import { execGit, tmpDirPath } from './util.js';

/** The person's own credential setup, recording whether git asked it */
export interface CredentialRecorder {
  /** A global git config whose only helper is the keychain stand-in */
  globalConfig: string;
  /**
   * A global git config whose helper list is empty, for a run without the
   * keychain. git reads an empty helper as a reset of every helper a config
   * read before it added, so no helper of the platform's own answers ahead
   * of the askpass
   */
  emptyHelperConfig: string;
  /** A program git runs as `GIT_ASKPASS` or `SSH_ASKPASS` */
  askpass: string;
  /** The same program, answering nothing and exiting non-zero */
  failingAskpass: string;
  /**
   * Every request in order, `keychain <action>`, `askpass <prompt>` or
   * `askpass-fails <prompt>`
   */
  recorded: () => Promise<string[]>;
}

/**
 * A keychain stand-in, the only credential helper of a global config, that
 * answers `person` and `keychain-secret`, an askpass that answers
 * `askpass-secret`, and one that answers nothing and fails. Each of them
 * records every request, so a test asserts what reached them rather than what
 * Core believes it configured.
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
  const emptyHelperConfig = Path.join(dir, 'empty-helper.gitconfig');
  await Fs.writeFile(globalConfig, '');
  await Fs.writeFile(emptyHelperConfig, '');
  // An empty helper first, as a person setting their own helper writes it, so
  // the stand-in is the whole list, and that empty helper alone is the config
  // of a run without a keychain. git takes the empty value as a reset of every
  // helper a config read before it added, which on Windows is the Git
  // Credential Manager of MinGit's system config
  const helperLists: [string, string[]][] = [
    [globalConfig, ['', `!'${process.execPath}' '${helper}'`]],
    [emptyHelperConfig, ['']],
  ];
  for (const [file, values] of helperLists) {
    for (const value of values) {
      await execGit(dir, [
        'config',
        '--file',
        file,
        '--add',
        'credential.helper',
        value,
      ]);
    }
  }

  /**
   * Writes an askpass program that records the prompt it was asked under
   * `name` and then runs `answer`, and returns what git starts: a shell
   * script, or on Windows a batch file that hands git the program's exit code.
   */
  async function writeAskpass(name: string, answer: string): Promise<string> {
    const script = Path.join(dir, `${name}.cjs`);
    await Fs.writeFile(
      script,
      `require('node:fs').appendFileSync(${JSON.stringify(log)}, '${name} ' + process.argv[2] + '\\n'); ${answer}\n`
    );
    if (process.platform === 'win32') {
      const batch = Path.join(dir, `${name}.bat`);
      await Fs.writeFile(
        batch,
        `@echo off\r\n"${process.execPath}" "${script}" %*\r\nexit /b %errorlevel%\r\n`
      );
      return batch;
    }
    const shell = Path.join(dir, `${name}.sh`);
    await Fs.writeFile(
      shell,
      `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`,
      { mode: 0o700 }
    );
    return shell;
  }

  const askpass = await writeAskpass(
    'askpass',
    "process.stdout.write('askpass-secret\\n');"
  );
  const failingAskpass = await writeAskpass(
    'askpass-fails',
    'process.exit(1);'
  );

  return {
    globalConfig,
    emptyHelperConfig,
    askpass,
    failingAskpass,
    recorded: async function () {
      if ((await Fs.pathExists(log)) === false) {
        return [];
      }
      return (await Fs.readFile(log, 'utf8')).split('\n').filter(Boolean);
    },
  };
}
