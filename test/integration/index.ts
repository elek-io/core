import Chai from 'chai';
import ChaiAsPromised from 'chai-as-promised';
import Fs from 'fs-extra';
import Path from 'path';
import { GitSignature } from '../../old/src/util/git';
import ElekIoCore from '../../src';
import InvalidBcp47LanguageTagError from '../../src/error/InvalidBcp47LanguageTagError';
import Util from '../../src/util';

Chai.use(ChaiAsPromised);
const expect = Chai.expect;
const core = new ElekIoCore({
  signature: {
    name: 'John Doe',
    email: 'john.doe@test.com'
  }
});

describe('Class ElekIoCore', () => {

  let projectId: string;
  let anotherProjectId: string;
  let assetId: string;

  it('should be able to initialize', async () => {
    await Fs.remove(Util.workingDirectory);
    expect(await Fs.pathExists(Util.workingDirectory)).to.equal(false);

    await core.init();
    expect(await Fs.pathExists(Util.workingDirectory)).to.equal(true);
  });

  it('should be able to create a new project', async () => {
    const project = await core.project.create('Project 1', 'The first project');
    projectId = project.id;

    expect(project).to.have.property('name', 'Project 1');
    expect(await Fs.pathExists(Util.pathTo.project(project.id))).to.equal(true);
  });

  it('should be able to read an existing project', async () => {
    const project = await core.project.read(projectId);

    expect(project).to.have.property('name', 'Project 1');
  });

  it('should be able to update an existing project', async () => {
    const project = await core.project.read(projectId);
    project.name = 'Project';
    await core.project.update(project);

    expect(await core.project.read(project.id)).to.have.property('name', 'Project');
  });

  it('should be able to add an asset to an existing project', async () => {
    const project = await core.project.read(projectId);
    const filePath = Path.resolve('./test/asset/300x300.png');
    const asset = await core.asset.create(filePath, project, 'en-GB', 'Asset 1', 'My first asset');
    assetId = asset.id;

    expect(asset).to.have.property('name', 'Asset 1');
    expect(await Fs.pathExists(Util.pathTo.asset(project.id, asset.id, asset.language))).to.equal(true);
    expect(await Fs.pathExists(Path.join(Util.workingDirectory, asset.path))).to.equal(true);
  });

  it('should throw an error when an invalid language tag is used', async () => {
    const project = await core.project.read(projectId);
    const filePath = Path.resolve('./test/asset/300x300.png');

    expect(core.asset.create(filePath, project, 'en_US', 'Asset 1', 'My first asset')).to.be.rejectedWith(InvalidBcp47LanguageTagError).and.eventually.have.property('name', 'InvalidBcp47LanguageTagError');
  });

  it('should be able to subscribe to events', async () => {
    let counter = 0;
    core.events.subscribe((event) => {
      expect(event).to.have.property('type', 'event');
      counter++;
    });
    const project = await core.project.create('Another Project', 'The second project');
    anotherProjectId = project.id;
    expect(counter).to.be.at.least(1);
  });

  it('should be able to load all projects from disk', async () => {
    const projects = await core.projects();

    expect(projects.length).to.equal(2);
  });

  it('should be able to read an asset', async () => {
    const project = await core.project.read(projectId);
    const asset = await core.asset.read(project, assetId, 'en-GB');

    expect(asset).to.have.property('name', 'Asset 1');
  });

  it('should be able to update an asset', async () => {
    const project = await core.project.read(projectId);
    const asset = await core.asset.read(project, assetId, 'en-GB');
    asset.name = 'Asset';
    await core.asset.update(project, asset);

    expect(await core.asset.read(project, asset.id, asset.language)).to.have.property('name', 'Asset');
  });

  it('should be able to load all assets from disk', async () => {
    const project = await core.project.read(projectId);
    const assets = await core.assets(project);

    expect(assets.length).to.equal(1);
  });

  it('should be able to identify a project', async () => {
    const project = await core.project.read(projectId);
    const asset = await core.asset.read(project, assetId, 'en-GB');

    expect(await core.project.isProject(asset)).to.equal(false);
    expect(await core.project.isProject(project)).to.equal(true);
  });

  it('should be able to identify an asset', async () => {
    const project = await core.project.read(projectId);
    const asset = await core.asset.read(project, assetId, 'en-GB');

    expect(await core.asset.isAsset(project)).to.equal(false);
    expect(await core.asset.isAsset(asset)).to.equal(true);
  });

  it('should be able to delete an asset', async () => {
    const project = await core.project.read(projectId);
    const asset = await core.asset.read(project, assetId, 'en-GB');
    await core.asset.delete(project, asset);

    expect(core.asset.read(project, assetId, asset.language)).to.be.rejectedWith();
    expect(await Fs.pathExists(Util.pathTo.asset(project.id, asset.id, asset.language))).to.equal(false);
    expect(await Fs.pathExists(Path.join(Util.workingDirectory, asset.path))).to.equal(false);
  });

  it('should be able to delete a project', async () => {
    const project = await core.project.read(anotherProjectId);
    await core.project.delete(project);

    expect(core.project.read(anotherProjectId)).to.be.rejectedWith();
    expect(await Fs.pathExists(Util.pathTo.project(project.id))).to.equal(false);
  });
});