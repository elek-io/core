import Fs from 'fs-extra';
import Path from 'path';
import Elek from '../src/index';

beforeAll(async () => {
  await Elek.init();
});

afterAll(async () => {
  await Fs.remove(Path.join(Elek.util.pathTo.projects, 'some-other-folder'));
});

describe('index module', () => {

  it('should not produce errors when there are subdirectories inside the local projects directory, that are not used as a project', async () => {
    await Fs.mkdirp(Path.join(Elek.util.pathTo.projects, 'some-other-folder'));
    await expect(Elek.projects.local()).resolves.not.toThrowError();
  });
  
});