import Fs from 'fs-extra';
import ElekIoCore from '../src/index';
import Project from '../src/project';
import Block from '../src/block';

const core = new ElekIoCore();

const signature = {
  name: 'John Doe', 
  email: 'john.doe@domain.com'
};

let project: Project;
let block: Block;

beforeAll(async () => {
  await core.init();
  project = await core.project.create('My first project', signature);
});

afterAll(async () => {
  await project.delete();
});

describe('Block module', () => {

  it('should be able to access all blocks of a project', async () => {
    expect(project.blocks.length).toBe(1);
  });

  it('should be able to create a new block', async () => {
    block = await project.block.create(signature, 'en-US', {}, '# Hello World!');
    expect(project.blocks.length).toBe(2);
    expect(block.language).toBe('en-US');
    expect(block.content).toContain('# Hello World!');
  });

  it('should be able to update an existing block', async () => {
    block.content = '# Lorem Ipsum!';
    await block.save(signature);
    expect(block.content).toContain('# Lorem Ipsum!');
  });

  it('should be able to render an existing block', async () => {
    const html = await block.render({});
    expect(html).toContain('<h1>Lorem Ipsum!</h1>');
  });

  it('should be able to render an existing block with restrictions', async () => {
    const html = await block.render({not: ['heading']});
    expect(html).toContain('<p># Lorem Ipsum!</p>');
  });

  it('should be able to delete an existing block', async () => {
    await block.delete(signature);
    expect(await Fs.pathExists(core.util.pathTo.block(project.id, block.id, block.language))).toBe(false);
    expect(project.blocks.length).toBe(1);
  });

});