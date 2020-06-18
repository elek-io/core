import Path from 'path';
import * as Elek from '../src/index';
import * as Util from '../src/util';

beforeAll(async () => {
  await Util.rmrf(Util.pathTo.projects);
  await Util.mkdir(Util.pathTo.projects);
});

describe('index module', () => {
  it('should not produce errors when there are subdirectories inside the local projects directory, that are not used as a project', async () => {
    await Util.mkdir(Path.join(Util.pathTo.projects, 'some-other-folder'));
    const projects = await Elek.projects.local();
    expect(projects.length).toBe(0);
  });
});