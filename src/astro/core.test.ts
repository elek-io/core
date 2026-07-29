import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { getCore } from './core.js';

describe('getCore', () => {
  beforeAll(() => {
    // Stubbed before the first getCore call, since the instance is
    // created once and keeps what it was constructed with
    vi.stubEnv('ELEK_IO_LOG_LEVEL', 'error');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

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

  it('takes its log level from the environment', () => {
    // Passing a level here would win over ELEK_IO_LOG_LEVEL and leave a
    // consumer no way to quieten Core inside an Astro build
    expect(getCore().options.log.level).toBe('error');
  });
});
