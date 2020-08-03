import Elek from '../src/index';
import Project from '../src/project';
import Page from '../src/page';

const elek = new Elek();

const signature = {
  name: 'John Doe', 
  email: 'john.doe@domain.com'
};

let project: Project;
let page: Page;

beforeAll(async () => {
  await elek.init();
  project = await elek.project.create('My first project', signature);
});

afterAll(async () => {
  await project.delete();
});

describe('Page module', () => {

  it('should be able to access all pages of a project', async () => {
    expect(project.pages.length).toBe(1);
  });

  it('should be able to create a new page', async () => {
    page = await project.page.create(signature, 'en-US');
    expect(project.pages.length).toBe(2);
    expect(page.language).toBe('en-US');
  });

  it('should be able to update an existing page', async () => {
    page.config.name = 'Another page';
    await page.save(signature);
    expect(page.config.name).toContain('Another page');
  });

  it('should be able to delete an existing page', async () => {
    await page.delete(signature);
    // expect(await Fs.pathExists(page.path)).toBe(false);
    expect(project.pages.length).toBe(1);
  });

});