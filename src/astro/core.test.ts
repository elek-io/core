import { describe, expect, it } from 'vitest';
import { getCore } from './core.js';

describe('getCore', () => {
  it('returns the same instance on every call', () => {
    // One Core per process is what makes the loaders coordinate
    expect(getCore()).toBe(getCore());
  });

  it('reads files without caching them', () => {
    // The Desktop app writes the Project while astro dev reads it, and
    // Core only invalidates its cache for writes it makes itself, so a
    // cached read would serve content one edit behind
    expect(getCore().options.file.cache).toBe(false);
  });
});
