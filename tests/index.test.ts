import Path from 'path';
import Elek from '../src/index';

beforeAll(async () => {
  await Elek.util.rmrf(Elek.util.pathTo.projects);
  await Elek.util.mkdir(Elek.util.pathTo.projects);
});

describe('index module', () => {
  it('should not produce errors when there are subdirectories inside the local projects directory, that are not used as a project', async () => {
    await Elek.util.mkdir(Path.join(Elek.util.pathTo.projects, 'some-other-folder'));
    const projects = await Elek.projects.local();
    expect(projects.length).toBe(0);
  });
});