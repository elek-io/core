import Elek from '../src/index';
import { Signature } from 'nodegit';
import Project from '../src/project';

const signature = Signature.now('John Doe', 'john.doe@domain.com');

let project: Project;

beforeAll(async () => {
  await Elek.init();
  project = await new Elek.project().create('My first project', signature);
});

// afterAll(async () => {
//   await project.delete();
// });

describe('project module', () => {

  it('should be able to load the existing project "My first project"', async () => {
    const loadedProject = await new Elek.project().load(project.id);
    expect(loadedProject.config.name).toBe('My first project');
  });

  it('should not be able to reload an already initialized project', async () => {
    await expect(project.load(project.id)).rejects.toThrowError();
  });

  it('should be able to save changes to disk', async () => {
    project.config.name = 'The first project';
    await project.save(signature);
    // Test the config in memory
    expect(project.config.name).toBe('The first project');
    // And check again if the changes are also present on disk
    const projectConfig = await Elek.util.read.project(project.id);
    expect(projectConfig.name).toBe('The first project');
  });

  it('should be able to create new pages', async () => {
    await project.page.create(signature, {
      name: 'Another page',
      slug: 'another-page',
      stage: 'wip',
      layoutId: 'about',
      content: []
    });
    await project.page.create(signature, {
      name: 'Foo bar',
      slug: 'foo-bar',
      stage: 'private',
      layoutId: 'about',
      content: []
    });
    expect(project.pages.length).toBe(3);
  });

  it('should be able to find a page', async () => {
    const firstPage = await project.page.find('id', project.pages[0].id);
    expect(firstPage).toBeDefined();
    if (firstPage) {
      expect(firstPage.id).toBe(project.pages[0].id);
    }
    const secondPage = await project.page.find('name', 'Foo bar');
    expect(secondPage).toBeDefined();
    if (secondPage) {
      expect(secondPage.config.name).toBe('Foo bar');
    }
  });

});