import Fs from 'fs-extra';
import Elek from '../src/index';
import Project from '../src/project';
import Asset from '../src/asset';

const elek = new Elek();

const signature = {
  name: 'John Doe', 
  email: 'john.doe@domain.com'
};

let project: Project;
let asset: Asset;

beforeAll(async () => {
  await elek.init();
  project = await elek.project.create('My first project', signature);
});

afterAll(async () => {
  await project.delete();
});

describe('Asset module', () => {

  it('should be able to create a new asset', async () => {
    asset = await project.asset.create(signature, 'en-US');
    expect(project.assets.length).toBe(1);
    expect(asset.language).toBe('en-US');
  });

  it('should be able to access all assets of a project', async () => {
    expect(project.assets.length).toBe(1);
  });

  it('should be able to update an existing asset', async () => {
    const rawData = (await Fs.readFile('./tests/assets/300.png')).toString();

    asset.config.name = 'Another asset';
    asset.content = rawData;

    await asset.save(signature);
    expect(asset.config.name).toContain('Another asset');
    expect(asset.content).toBe(rawData);
  });

  it('should be able to load an existing asset', async () => {
    const result = await new Asset(project).load(asset.id, asset.language);
    expect(result.config.name).toContain('Another asset');
  });

  it('should be able to delete an existing asset', async () => {
    await asset.delete(signature);
    expect(project.assets.length).toBe(0);
  });

});