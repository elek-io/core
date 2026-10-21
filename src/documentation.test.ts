// @vitest-environment jsdom
import Path from 'node:path';
import Fs from 'fs-extra';
import mermaid from 'mermaid';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import {
  anchorOf,
  exists,
  mermaidBlocks,
  readFile,
  repositoryRoot,
  rules,
  rulesDoc,
  violationsOf,
  type Violation,
} from './test/documentation.js';

/**
 * Guards the documentation rules that a machine can check.
 *
 * Every rule lives in src/test/documentation.ts. Files written before a rule
 * existed are exempted in documentation-baseline.json, which may only shrink,
 * see contributing/documentation.md.
 */
const baselinePath = Path.join(
  repositoryRoot,
  'src/documentation-baseline.json'
);

const baselineSchema = z.record(z.string(), z.array(z.string()));

function readBaseline(): Record<string, string[]> {
  if (!Fs.pathExistsSync(baselinePath)) return {};
  return baselineSchema.parse(
    JSON.parse(Fs.readFileSync(baselinePath, 'utf8'))
  );
}

function format(violations: Violation[]): string {
  return violations
    .map(
      (violation) =>
        `  ${violation.file}:${violation.line} ${violation.message}`
    )
    .join('\n');
}

const baseline = readBaseline();

// Diagrams are a recommended form, so a broken one has to fail rather than ship.
mermaid.initialize({ logLevel: 'fatal' });

describe('documentation', () => {
  for (const rule of rules) {
    it(`${rule.id}: ${rule.summary}`, () => {
      const exempt = new Set(baseline[rule.id] ?? []);
      const violations = violationsOf(rule).filter(
        (violation) => !exempt.has(violation.file)
      );

      expect(
        violations,
        `${violations.length} violation(s) of ${rule.id}:\n${format(violations)}\n\nSee ${rulesDoc}.`
      ).toStrictEqual([]);
    });
  }

  it('diagrams/mermaid: every diagram parses', async () => {
    const broken: string[] = [];
    for (const block of mermaidBlocks()) {
      try {
        await mermaid.parse(block.code);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        broken.push(`  ${block.file}:${block.line} ${message.split('\n')[0]}`);
      }
    }

    expect(
      broken,
      `${broken.length} diagram(s) do not parse:\n${broken.join('\n')}\n\nSee ${rulesDoc}.`
    ).toStrictEqual([]);
  });

  it('anchors match the ones GitHub generates', () => {
    // Ground truth from GitHub's own markdown API, not inferred. It keeps `-`
    // and `_`, so an underscore survives and a `--` flag after a space yields
    // three hyphens.
    const cases = [
      [
        'Decided: `min_scale = 1`, and the runtime choice survives it',
        'decided-min_scale--1-and-the-runtime-choice-survives-it',
      ],
      [
        'The fix is `--no-optional`, and the setting that reads like the fix does nothing',
        'the-fix-is---no-optional-and-the-setting-that-reads-like-the-fix-does-nothing',
      ],
    ] as const;

    for (const [heading, expected] of cases) {
      expect(anchorOf(heading), `anchor for "${heading}"`).toEqual(expected);
    }
  });

  describe('links/release-table', () => {
    const table = readFile('docs/releases.md');
    const entryRow = '| `entryChanges` | `modified` | patch |';

    /** What the rule reports for a table, which is the real one with one defect. */
    const messagesOf = (content: string) =>
      rules
        .filter((rule) => rule.id === 'links/release-table')
        .flatMap((rule) => rule.check('docs/releases.md', content))
        .map((violation) => violation.message);

    it('reports a bump the classifier does not give', () => {
      const messages = messagesOf(
        table.replace(entryRow, '| `entryChanges` | `modified` | minor |')
      );

      expect(messages).toContain('modified is classified as patch, not minor');
    });

    it('reports a change type no row documents', () => {
      const messages = messagesOf(
        table.replaceAll(/^.*`ofComponentsChanged`.*$/gm, '')
      );

      expect(messages).toContain(
        'fieldChanges carries ofComponentsChanged with no row in the table'
      );
      expect(messages).toContain(
        'componentFieldChanges carries ofComponentsChanged with no row in the table'
      );
    });

    it('reports an array a release diff does not hold', () => {
      const messages = messagesOf(
        table.replace(entryRow, '| `entryChange` | `modified` | patch |')
      );

      expect(messages).toContain(
        'entryChange is not an array of a release diff, drop it from the row'
      );
    });

    it('reports an array that never carries the change type', () => {
      const messages = messagesOf(
        table.replace(entryRow, '| `assetChanges` | `modified` | patch |')
      );

      expect(messages).toContain(
        'assetChanges never carries modified, drop it from the row'
      );
    });

    it('names both causes when nothing pairs a bump with the change type', () => {
      const messages = messagesOf(
        table.replace(entryRow, '| `entryChanges` | `renamed` | patch |')
      );

      // The pair is read file-wide, so a reordered push reads like a stale row
      expect(messages).toContain(
        'ReleaseService pairs no bump with renamed, so either nothing classifies it and the row goes, or its push writes bump before changeType'
      );
    });

    it('reports the section being renamed away', () => {
      const messages = messagesOf(
        table.replace(
          '### Every change a diff can carry',
          '### Every change a release diff can carry'
        )
      );

      expect(messages).toStrictEqual([
        'the "Every change a diff can carry" section is gone, and with it the table of every change type',
      ]);
    });
  });

  it('baseline holds no stale entries', () => {
    const stale: string[] = [];
    for (const [id, files] of Object.entries(baseline)) {
      const rule = rules.find((candidate) => candidate.id === id);
      if (!rule) {
        stale.push(`  ${id} is not a rule any more, drop it`);
        continue;
      }
      const offending = new Set(
        violationsOf(rule).map((violation) => violation.file)
      );
      for (const file of files) {
        if (offending.has(file)) continue;
        const reason = exists(file) ? 'passes now' : 'no longer exists';
        stale.push(`  ${id}: ${file} ${reason}, drop it`);
      }
    }

    expect(
      stale,
      `The baseline may only shrink:\n${stale.join('\n')}\n\nSee ${rulesDoc}.`
    ).toStrictEqual([]);
  });
});
