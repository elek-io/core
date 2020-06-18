import * as Elek from '../src/index';
import * as Util from '../src/util';
import { Signature } from 'nodegit';

const signature = Signature.now('John Doe', 'john.doe@domain.com');

let firstProjectId: string;

beforeAll(async () => {
  await Util.rmrf(Util.pathTo.projects);
  await Util.mkdir(Util.pathTo.projects);
});

describe('project module', () => {
  it('should create a new project "My first project"', async () => {
    const project = await new Elek.project().create('My first project', signature);
    firstProjectId = project.id;
    const projects = await Elek.projects.local();
    expect(projects.length).toBe(1);
    expect(projects[0]).not.toBeUndefined();
    expect(projects[0].name).toBe('My first project');
  });

  it('should be able to load the existing project "My first project"', async () => {
    const project = await new Elek.project().load(firstProjectId);
    expect(project.name).toBe('My first project');
  });

  it('should not be able to reload an already initialized project', async () => {
    const project = await new Elek.project().load(firstProjectId);
    await expect(project.load(project.id)).rejects.toThrowError();
  });

  it('should be able to save changes to disk', async () => {
    const project = await new Elek.project().load(firstProjectId);
    project.name = 'The first project';
    await project.save(signature, 'Changed the projects name');
    // Test the object itself
    expect(project.name).toBe('The first project');
    // This should affect the config too
    expect(project.config.name).toBe('The first project');
    // Load the same project again but now from disk
    const projectAgain = await new Elek.project().load(firstProjectId);
    // And check again if the changes are still present
    expect(projectAgain.name).toBe('The first project');
    expect(projectAgain.config.name).toBe('The first project');
  });
});