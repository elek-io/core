import Fs from 'fs-extra';
import Path from 'path';
import ElekIoCore from '../src/index';

const core = new ElekIoCore();

beforeAll(async () => {
  await core.init();
});

afterAll(async () => {
  await Fs.remove(Path.join(core.util.pathTo.projects, 'some-other-folder'));
});

describe('Index module', () => {

  it('should not produce errors when there are subdirectories inside the local projects directory, that are not used as a project', async () => {
    await Fs.mkdirp(Path.join(core.util.pathTo.projects, 'some-other-folder'));
    await expect(core.reloadProjects()).resolves.not.toThrowError();
  });
  
});