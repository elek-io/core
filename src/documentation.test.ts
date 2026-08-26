// @vitest-environment jsdom
import Path from 'node:path';
import Fs from 'fs-extra';
import mermaid from 'mermaid';
import { describe, expect, it } from 'vitest';
import z from 'zod';
import {
  exists,
  mermaidBlocks,
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
