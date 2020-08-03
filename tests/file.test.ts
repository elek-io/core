import Fs from 'fs-extra';
import Elek from '../src/index';
import Project from '../src/project';
import PageFile from '../src/file/pageFile';
import { PageFileContent } from '../src/page';
import BlockFile from '../src/file/blockFile';
import { BlockFileHeader } from '../src/block';
import AssetFile, { AssetFileContent } from '../src/file/assetFile';
import Asset from '../src/asset';

const elek = new Elek();

const signature = {
  name: 'John Doe', 
  email: 'john.doe@domain.com'
};

let project: Project;
let pageFile: PageFile;
let blockFile: BlockFile;
let assetFile: AssetFile;

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
  await elek.init();
  project = await elek.project.create('My first project', signature);
  pageFile = new PageFile(project.id, project.pages[0].id, project.pages[0].language);
  blockFile = new BlockFile(project.id, project.blocks[0].id, project.blocks[0].language);
  await new Asset(project).create(signature, 'en-US');
  assetFile = new AssetFile(project.id, project.assets[0].id, project.assets[0].language);
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

describe('Asset file module', () => {

  it('should thrrow an error when used language is not valid', async () => {
    expect(() => new AssetFile(project.id, project.assets[0].id, 'invalid language')).toThrowError();
  });

  it('should be able to save a new asset on disk', async () => {
    const rawData = (await Fs.readFile('./tests/assets/300.png')).toString();
    
    await assetFile.save({
      name: elek.util.slug('My first file'),
      description: 'A picture showing elek.io',
      data: rawData,
      mimeType: 'image/png'
    });

    const result: AssetFileContent = JSON.parse((await Fs.readFile(assetFile.path)).toString());
    expect(result.name).toBe(elek.util.slug('My first file'));
    expect(result.data).toBe(Buffer.from(rawData).toString('base64'));
  });

  it('should be able to load a file from disk', async () => {
    const rawData = (await Fs.readFile('./tests/assets/300.png')).toString();

    const result = await assetFile.load();

    expect(result.name).toBe(elek.util.slug('My first file'));
    expect(result.data).toBe(rawData);
  });

});