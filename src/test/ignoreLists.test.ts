import { exec as gitExec } from 'dugite';
import Fs from 'fs-extra';
import { execFile } from 'node:child_process';
import Os from 'node:os';
import Path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { cliRunDirName, createRunId, nodeRunDirName } from './worker.js';

/**
 * Guards the ignore lists that cover the run directories a suite run writes
 * in the repository root.
 *
 * Nothing else reads either list, so a pattern deleted from one of them would
 * leave a crashed run's leftover breaking `git status` or `pnpm lint` while
 * every test stayed green, see contributing/testing.md.
 */
const repositoryRoot = Path.resolve();

/** The oxlint entry point, started the way a shell starts it */
const oxlintBin = Path.resolve('node_modules/oxlint/bin/oxlint');

/** A file oxlint has something to say about, so a run that reaches it reports it */
const probeSource = 'var ignored = 1;\nexport default ignored;\n';

/** What oxlint reported, in the key names it prints them under. */
interface OxlintReport {
  number_of_files: number;
  diagnostics: { code: string; filename: string }[];
}

/** Plants a lintable file in one run directory of the repository root. */
async function plantProbe(directoryName: string): Promise<string> {
  const directory = Path.join(repositoryRoot, directoryName);
  await Fs.outputFile(Path.join(directory, 'ignore-probe.ts'), probeSource);
  onTestFinished(async () => {
    await Fs.remove(directory);
  });
  // Relative and slash separated, which is the shape git echoes back
  return `${directoryName}/ignore-probe.ts`;
}

/** Both repository-root directories of one run, each holding a probe. */
async function plantProbes(): Promise<string[]> {
  // This process is alive, so another run's start leaves these in place
  const runId = createRunId();
  return [
    await plantProbe(cliRunDirName(runId)),
    await plantProbe(nodeRunDirName(runId)),
  ];
}

/** Runs oxlint with one config over the given paths and reads its report. */
async function runOxlint(props: {
  config: string;
  paths: string[];
}): Promise<OxlintReport> {
  const printed = await new Promise<string>((resolve, reject) => {
    execFile(
      process.execPath,
      [oxlintBin, '--config', props.config, '--format', 'json', ...props.paths],
      { cwd: repositoryRoot, maxBuffer: 8 * 1024 * 1024 },
      (_error, stdout, stderr) => {
        // oxlint exits non-zero both for a diagnostic and for a path it found
        // no file to lint at, so the report says what happened rather than
        // the exit code
        const start = stdout.indexOf('{');
        if (start === -1) {
          reject(new Error(`oxlint printed no report:\n${stdout}\n${stderr}`));
          return;
        }
        resolve(stdout.slice(start));
      }
    );
  });
  return JSON.parse(printed) as OxlintReport;
}

/** One line of `git check-ignore`, without the line number of the pattern. */
function ignoreOf(line: string): {
  list: string;
  pattern: string;
  path: string;
} {
  const [source = '', path = ''] = line.split('\t');
  // `<list>:<line number>:<pattern>`, and `::` where nothing matched. The
  // line number is left out, so editing a list cannot fail this
  const parts = source.split(':');
  return { list: parts[0] ?? '', pattern: parts.slice(2).join(':'), path };
}

/** Where oxlint reported something, whatever separator it printed */
function filenamesOf(report: OxlintReport): string[] {
  return report.diagnostics
    .map((found) => found.filename.replaceAll('\\', '/'))
    .toSorted();
}

describe('the run directories in the repository root', () => {
  it('are ignored by git, name by name', async () => {
    const probes = await plantProbes();
    // A path git tracks, so a list matching everything would show up here
    const tracked = 'src/test/worker.ts';

    const { stdout, exitCode } = await gitExec(
      ['check-ignore', '--verbose', '--non-matching', '--', ...probes, tracked],
      repositoryRoot
    );

    expect(exitCode).toBe(0);
    expect(stdout.trimEnd().split('\n').map(ignoreOf)).toEqual([
      { list: '.gitignore', pattern: '.elek.io-*', path: probes[0] },
      { list: '.gitignore', pattern: '.elek.io-*', path: probes[1] },
      { list: '', pattern: '', path: tracked },
    ]);
  });

  it('are ignored by the linter, name by name', async () => {
    const probes = await plantProbes();

    const report = await runOxlint({
      config: Path.join(repositoryRoot, '.oxlintrc.json'),
      paths: probes,
    });

    expect(report.number_of_files).toBe(0);
    expect(report.diagnostics).toEqual([]);
  });

  it('are linted once the linter has no list to ignore them by', async () => {
    const probes = await plantProbes();
    const control = await Fs.mkdtemp(
      Path.join(Os.tmpdir(), 'elek-io-core-oxlint-')
    );
    onTestFinished(async () => {
      await Fs.remove(control);
    });
    const config = Path.join(control, '.oxlintrc.json');
    await Fs.outputJson(config, { rules: { 'no-var': 'error' } });

    const report = await runOxlint({ config, paths: probes });

    // So the silence above is the list's doing rather than a path oxlint
    // never reached
    expect(report.number_of_files).toBe(2);
    expect(filenamesOf(report)).toEqual(probes.toSorted());
  });
});
