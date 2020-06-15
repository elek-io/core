import * as Elek from '../src/index';
import * as Util from '../src/util';
import { Signature } from 'nodegit';

beforeAll(async () => {
  await Util.rmrf(Util.pathTo.projects);
  await Util.mkdir(Util.pathTo.projects);
});

test('creating new project "My first project"', async () => {
  await new Elek.project().create('My first project', Signature.now('John Doe', 'john.doe@domain.com'));
  const projects = await Elek.projects();
  expect(projects[0]).not.toBeUndefined();
  expect(projects[0].name).toBe('My first project');
});