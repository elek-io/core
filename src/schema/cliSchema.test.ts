import { describe, expect, it } from 'vitest';
import { exportSchema, apiStartSchema, pullSchema } from './cliSchema.js';
import { v4 } from 'uuid';

const baseInput = {
  options: { watch: false },
};

describe('exportSchema projectsSchema', () => {
  it('defaults to "all" when no value is provided', () => {
    const result = exportSchema.parse(baseInput);

    expect(result.projects).toBe('all');
  });

  it('parses "all" as the literal string "all"', () => {
    const result = exportSchema.parse({ ...baseInput, projects: 'all' });

    expect(result.projects).toBe('all');
  });

  it('parses a single UUID', () => {
    const id = v4();
    const result = exportSchema.parse({ ...baseInput, projects: id });

    expect(result.projects).toEqual([id]);
  });

  it('parses comma-separated UUIDs', () => {
    const id1 = v4();
    const id2 = v4();
    const result = exportSchema.parse({
      ...baseInput,
      projects: `${id1},${id2}`,
    });

    expect(result.projects).toEqual([id1, id2]);
  });

  it('trims whitespace around UUIDs', () => {
    const id1 = v4();
    const id2 = v4();
    const result = exportSchema.parse({
      ...baseInput,
      projects: `${id1} , ${id2}`,
    });

    expect(result.projects).toEqual([id1, id2]);
  });

  it('throws on invalid UUID values', () => {
    expect(() =>
      exportSchema.parse({ ...baseInput, projects: 'not-a-uuid' })
    ).toThrow();
  });

  it('throws when one of multiple values is not a valid UUID', () => {
    const id = v4();
    expect(() =>
      exportSchema.parse({ ...baseInput, projects: `${id},invalid` })
    ).toThrow();
  });
});

describe('exportSchema outDir', () => {
  it('defaults to "./.elek.io" when no value is provided', () => {
    const result = exportSchema.parse(baseInput);

    expect(result.outDir).toBe('./.elek.io');
  });
});

describe('exportSchema template', () => {
  it('defaults to "nested" when no value is provided', () => {
    const result = exportSchema.parse(baseInput);

    expect(result.template).toBe('nested');
  });

  it('accepts "nested"', () => {
    const result = exportSchema.parse({ ...baseInput, template: 'nested' });

    expect(result.template).toBe('nested');
  });

  it('accepts "separate"', () => {
    const result = exportSchema.parse({ ...baseInput, template: 'separate' });

    expect(result.template).toBe('separate');
  });

  it('throws on invalid template value', () => {
    expect(() =>
      exportSchema.parse({ ...baseInput, template: 'invalid' })
    ).toThrow();
  });
});

describe('apiStartSchema', () => {
  it('defaults port to "31310" parsed as integer', () => {
    const result = apiStartSchema.parse({});

    expect(result.port).toBe(31310);
  });

  it('parses a string port to an integer', () => {
    const result = apiStartSchema.parse({ port: '8080' });

    expect(result.port).toBe(8080);
  });

  it('returns NaN for non-numeric port string', () => {
    const result = apiStartSchema.parse({ port: 'abc' });

    expect(result.port).toBeNaN();
  });
});

describe('pullSchema', () => {
  it('parses project, url and ref', () => {
    const id = v4();
    const result = pullSchema.parse({
      project: id,
      url: 'https://example.com/repo.git',
      ref: 'work',
    });

    expect(result).toEqual({
      project: id,
      url: 'https://example.com/repo.git',
      ref: 'work',
    });
  });

  it('accepts a Release version as ref and trims the url', () => {
    const result = pullSchema.parse({
      project: v4(),
      url: '  https://example.com/repo.git  ',
      ref: '1.2.3',
    });

    expect(result.url).toEqual('https://example.com/repo.git');
    expect(result.ref).toEqual('1.2.3');
  });

  it('rejects a missing project id and an invalid ref', () => {
    expect(() =>
      pullSchema.parse({ url: 'https://example.com/repo.git' })
    ).toThrow();
    expect(() =>
      pullSchema.parse({
        project: v4(),
        url: 'https://example.com/repo.git',
        ref: 'not a ref',
      })
    ).toThrow();
  });
});
