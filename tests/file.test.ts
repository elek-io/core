import Fs from 'fs-extra';
import Elek from '../src/index';
import Project from '../src/project';
import PageFile from '../src/file/pageFile';
import { PageFileContent } from '../src/page';
import BlockFile from '../src/file/blockFile';
import { BlockFileHeader } from '../src/block';

const signature = {
  name: 'John Doe', 
  email: 'john.doe@domain.com'
};

let project: Project;
let pageFile: PageFile;
let blockFile: BlockFile;

const invalidContent = {
  foo: 'bar',
  baz: [1, 2, 3, 4, 5, 6, 7],
  some: {
    deep: {
      nested: {
        object: true
      }
    }
  }
};

const validPageFileContent = new PageFileContent();
const validBlockFileHeader = new BlockFileHeader();

beforeAll(async () => {
  await Elek.init();
  project = await new Elek.project().create('My first project', signature);
  pageFile = new PageFile(project.id, project.pages[0].id, project.pages[0].language);
  blockFile = new BlockFile(project.id, project.blocks[0].id, project.blocks[0].language);
});

afterAll(async () => {
  await project.delete();
});

describe('Page file module', () => {

  it('should thrrow an error when used language is not valid', async () => {
    expect(() => new PageFile(project.id, project.pages[0].id, 'invalid language')).toThrowError();
  });

  it('should be able to save a new file on disk', async () => {
    await pageFile.save(validPageFileContent);
    expect(JSON.parse((await Fs.readFile(pageFile.path)).toString())).toMatchObject(validPageFileContent);
  });

  it('should be able to load a file from disk', async () => {
    const result = await pageFile.load();
    expect(result).toMatchObject(validPageFileContent);
  });

  it('should be able to heal the files content while saving', async () => {
    // eslint-disable-next-line
    // @ts-ignore
    await pageFile.save(invalidContent);
    expect(JSON.parse((await Fs.readFile(pageFile.path)).toString())).toMatchObject(validPageFileContent);
  });

  it('should be able to heal the files content while loading', async () => {
    await Fs.writeFile(pageFile.path, JSON.stringify(invalidContent, null, 2));
    const result = await pageFile.load();
    expect(result).toMatchObject(validPageFileContent);
  });

  it('should be able to delete the file', async () => {
    await pageFile.delete();
    expect(Fs.readFile(pageFile.path)).rejects.toThrowError();
  });

});

describe('Block file module', () => {

  it('should thrrow an error when used language is not valid', async () => {
    expect(() => new BlockFile(project.id, project.blocks[0].id, 'invalid language')).toThrowError();
  });

  it('should be able to save a new file on disk', async () => {
    await blockFile.save({
      header: validBlockFileHeader,
      body: '# Hello World!'
    });
    const result = (await Fs.readFile(blockFile.path)).toString();
    expect(result).toContain(JSON.stringify(validBlockFileHeader));
    expect(result).toContain('# Hello World!');
  });

  it('should be able to load a file from disk', async () => {
    const result = await blockFile.load();
    expect(result.header).toMatchObject(validBlockFileHeader);
    expect(result.body).toContain('# Hello World!');
  });

});