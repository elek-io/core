import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { apiClient } from '../.elek-io/client.js';
import ElekIoCore from './index.node.js';
import { beforeAll } from 'vitest';

const core = new ElekIoCore({
  log: {
    level: 'debug',
  },
});

const client = apiClient({
  baseUrl: 'http://localhost:31310',
  apiKey: 'abc123',
});

describe('Client', function () {
  beforeAll(async function () {
    await core.api.start(31310);
  });

  it('should be able to request a list of entries', async function () {
    const entries =
      await client.content.v1.projects[
        '32ba1a3c-c775-4ff0-b5cd-08c71edfe18b'
      ].collections['57cde539-fe26-40e7-b117-3aae2deece1e'].entries.list();

    console.log(entries);

    // expect(isRunningBefore).toEqual(false);
    // expect(isRunningAfter).toEqual(true);
  });
});
