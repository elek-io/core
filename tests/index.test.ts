import Fs from 'fs-extra';
import Path from 'path';
import Elek from '../src/index';

const elek = new Elek();

beforeAll(async () => {
  await elek.init();
});

afterAll(async () => {
  await Fs.remove(Path.join(elek.util.pathTo.projects, 'some-other-folder'));
});

describe('Index module', () => {

  it('should not produce errors when there are subdirectories inside the local projects directory, that are not used as a project', async () => {
    await Fs.mkdirp(Path.join(elek.util.pathTo.projects, 'some-other-folder'));
    await expect(elek.reloadProjects()).resolves.not.toThrowError();
  });
  
});