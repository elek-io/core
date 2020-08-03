import Fs from 'fs-extra';
import Elek from '../src/index';
import Project from '../src/project';

const elek = new Elek();

const signature = {
  name: 'John Doe', 
  email: 'john.doe@domain.com'
};

let project: Project;

beforeAll(async () => {
  await elek.init();
  project = await elek.project.create('My first project', signature);
});

afterAll(async () => {
  await project.delete();
});

describe('Project module', () => {

  it('should not be able to reload an already initialized project', async () => {
    await expect(project.load(project.id)).rejects.toThrowError();
  });

  it('should be able to save changes to disk', async () => {
    project.config.name = 'The first project';
    await project.save(signature);
    // Test the config in memory
    expect(project.config.name).toBe('The first project');
    // And check again if the changes are also present on disk
    const projectConfig = await Fs.readFile(elek.util.pathTo.projectConfig(project.id));
    expect(JSON.parse(projectConfig.toString()).name).toBe('The first project');
  });

  it('should be able to create new pages', async () => {
    await project.page.create(signature, 'en-US', {
      name: 'Another page',
      path: `/${elek.util.slug('Another page')}`,
      stage: 'wip',
      layoutId: 'about'
    });
    await project.page.create(signature, 'en-US', {
      name: 'Foo bar',
      path: `/foo/bar/${elek.util.slug('Foo bar')}`,
      stage: 'private',
      layoutId: 'about'
    });
    expect(project.pages.length).toBe(3);
  });

  it('should be able to find a page', async () => {
    // Find by ID
    const firstPage = project.pages.find((page) => {
      return page.id === project.pages[0].id;
    });
    expect(firstPage).toBeDefined();
    if (firstPage) {
      expect(firstPage.id).toBe(project.pages[0].id);
    }
    // Find by name
    const secondPage = project.pages.find((page) => {
      return page.config.name === 'Foo bar';
    });
    expect(secondPage).toBeDefined();
    if (secondPage) {
      expect(secondPage.config.name).toBe('Foo bar');
    }
  });

  it('should be able to find a block', async () => {
    const block = project.blocks.find((block) => {
      return block.id === project.blocks[0].id;
    });
    expect(block).toBeDefined();
    if (block) {
      expect(block.id).toBe(project.blocks[0].id);
    }
  });

  it('should be able to export', async () => {
    const data = await project.export();
    expect(data).toBeDefined();
    expect(data.name).toBe(project.config.name);
  });

  it('should be able to build', async () => {
    console.log(await project.build());
  }, 300000);
});