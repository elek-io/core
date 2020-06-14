import * as Project from '../src/project';
import * as Util from '../src/util';
import { Signature } from 'nodegit';
import Fs from 'fs';
import Path from 'path';

beforeAll(async () => {
  await Util.rmrf(Util.pathTo.projects);
  await Util.mkdir(Util.pathTo.projects);
  return Project.create('My project name', Signature.now('John Doe', 'john.doe@domain.com'));
});

const projectPath = Path.join(Util.pathTo.projects, 'my-project-name');

test('function "create" to create a new project folder', async () => {
  expect(await Fs.promises.access(projectPath)).toBeUndefined();
});

test('function "create" to initialize a new git repository', async () => {
  expect(await Util.git.discover(projectPath)).toBe(Path.join(projectPath, '.git'));
});