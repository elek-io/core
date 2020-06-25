import Elek from '../src/index';
import { Signature } from 'nodegit';

const signature = Signature.now('John Doe', 'john.doe@domain.com');

let firstProjectId: string;

describe('project module', () => {

  it('should create a new project "My first project"', async () => {
    const project = await new Elek.project().create('My first project', signature);
    firstProjectId = project.id;
    expect(project.config.name).toBe('My first project');
  });

  it('should be able to load the existing project "My first project"', async () => {
    const project = await new Elek.project().load(firstProjectId);
    expect(project.config.name).toBe('My first project');
  });

  it('should not be able to reload an already initialized project', async () => {
    const project = await new Elek.project().load(firstProjectId);
    await expect(project.load(project.id)).rejects.toThrowError();
  });

  it('should be able to save changes to disk', async () => {
    const project = await new Elek.project().load(firstProjectId);
    project.config.name = 'The first project';
    await project.save(signature);
    // Test the config in memory
    expect(project.config.name).toBe('The first project');
    // Load the same project again but now from disk
    const projectAgain = await new Elek.project().load(firstProjectId);
    // And check again if the changes are still present
    expect(projectAgain.config.name).toBe('The first project');
  });

});