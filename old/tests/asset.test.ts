import ElekIoCore from '../src/index';
import Project from '../src/project';
import Asset from '../src/asset';

const core = new ElekIoCore();

const signature = {
  name: 'John Doe', 
  email: 'john.doe@domain.com'
};

let project: Project;
let asset: Asset;

beforeAll(async () => {
  await core.init();
  project = await core.project.create('My first project', signature);
});

afterAll(async () => {
  await project.delete();
});

describe('Asset module', () => {

  it('should be able to create a new asset', async () => {
    asset = await project.asset.create(signature, 'en-US', './tests/assets/300.png', {name: 'Test file'});
    expect(project.assets.length).toBe(1);
    expect(asset.language).toBe('en-US');
  });

  it('should be able to access all assets of a project', async () => {
    expect(project.assets.length).toBe(1);
  });

  it('should be able to update an existing asset', async () => {
    asset.config.name = 'Another asset';

    await asset.save(signature);
    expect(asset.config.name).toContain('Another asset');
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