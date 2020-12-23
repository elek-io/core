import Chai from 'chai';
import ChaiAsPromised from 'chai-as-promised';
import Fs from 'fs-extra';
import Path from 'path';
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
  let pageId: string;
  let blockId: string;
  let snapshotId: string;
  let blockToRevertId: string;

  it('should be able to initialize', async () => {
    await Fs.remove(Util.workingDirectory);
    expect(await Fs.pathExists(Util.workingDirectory)).to.equal(false);

    await core.init();
    expect(await Fs.pathExists(Util.workingDirectory)).to.equal(true);
  }).timeout(5000);

  it('should be able to create a new project', async () => {
    const project = await core.project.create('Project 1', 'The first project');
    projectId = project.id;

    expect(project).to.have.property('name', 'Project 1');
    expect(await Fs.pathExists(Util.pathTo.project(project.id))).to.equal(true);
  }).timeout(5000);

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
    expect(await Fs.pathExists(Util.pathTo.lfsFile(project.id, asset.id, asset.language, asset.extension))).to.equal(true);
  });

  it('should be able to add a page to an existing project', async () => {
    const project = await core.project.read(projectId);
    const theme = await core.theme.read(project);
    const page = await core.page.create(project, 'en-GB', 'Page 1', '/test', theme.layouts[2].id);
    pageId = page.id;

    expect(page).to.have.property('name', 'Page 1');
    expect(await Fs.pathExists(Util.pathTo.page(project.id, page.id, page.language))).to.equal(true);
  });

  it('should be able to add a block to an existing project', async () => {
    const project = await core.project.read(projectId);
    const block = await core.block.create(project, 'en-GB', '# Hello World');
    blockId = block.id;

    expect(block).to.have.property('body', '# Hello World');
    expect(await Fs.pathExists(Util.pathTo.block(project.id, block.id, block.language))).to.equal(true);
  });

  it('should throw an error when an invalid language tag is used', async () => {
    const project = await core.project.read(projectId);
    const filePath = Path.resolve('./test/asset/300x300.png');

    expect(core.asset.create(filePath, project, 'en_US', 'Asset 1', 'My first asset')).to.be.rejectedWith(InvalidBcp47LanguageTagError).and.eventually.have.property('name', 'InvalidBcp47LanguageTagError');
  });

  it('should be able to subscribe to events', async () => {
    let counter = 0;
    core.event.on((event) => {
      expect(event).to.have.property('type', 'event');
      // console.log(event.id);
      counter++;
    });
    const project = await core.project.create('Another Project', 'The second project');
    anotherProjectId = project.id;
    expect(counter).to.be.at.least(1);
  }).timeout(5000);

  it('should be able to load all projects from disk', async () => {
    const projects = await core.projects();

    expect(projects.length).to.equal(2);
  });

  it('should be able to read an asset', async () => {
    const project = await core.project.read(projectId);
    const asset = await core.asset.read(project, assetId, 'en-GB');

    expect(asset).to.have.property('name', 'Asset 1');
  });

  it('should be able to read a page', async () => {
    const project = await core.project.read(projectId);
    const page = await core.page.read(project, pageId, 'en-GB');

    expect(page).to.have.property('name', 'Page 1');
  });

  it('should be able to read a block', async () => {
    const project = await core.project.read(projectId);
    const block = await core.block.read(project, blockId, 'en-GB');

    expect(block).to.have.property('body', '# Hello World');
  });

  it('should be able to update an asset', async () => {
    const project = await core.project.read(projectId);
    const asset = await core.asset.read(project, assetId, 'en-GB');
    asset.name = 'Asset';
    await core.asset.update(project, asset);

    expect(await core.asset.read(project, asset.id, asset.language)).to.have.property('name', 'Asset');
  });

  it('should be able to update a page', async () => {
    const project = await core.project.read(projectId);
    const page = await core.page.read(project, pageId, 'en-GB');
    page.name = 'Page';
    await core.page.update(project, page);

    expect(await core.page.read(project, page.id, page.language)).to.have.property('name', 'Page');
  });

  it('should be able to update a block', async () => {
    const project = await core.project.read(projectId);
    const block = await core.block.read(project, blockId, 'en-GB');
    block.body = '## Hello World!';
    await core.block.update(project, block);

    expect(await core.block.read(project, block.id, block.language)).to.have.property('body', '## Hello World!');
  });

  it('should be able to load all assets from disk', async () => {
    const project = await core.project.read(projectId);
    const assets = await core.assets(project);

    expect(assets.length).to.equal(1);
  });

  it('should be able to load all pages from disk', async () => {
    const project = await core.project.read(projectId);
    const pages = await core.pages(project);

    expect(pages.length).to.equal(2);
  });

  it('should be able to load all block from disk', async () => {
    const project = await core.project.read(projectId);
    const blocks = await core.blocks(project);

    expect(blocks.length).to.equal(2);
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

  it('should be able to identify a page', async () => {
    const project = await core.project.read(projectId);
    const page = await core.page.read(project, pageId, 'en-GB');

    expect(await core.page.isPage(project)).to.equal(false);
    expect(await core.page.isPage(page)).to.equal(true);
  });

  it('should be able to identify a block', async () => {
    const project = await core.project.read(projectId);
    const block = await core.block.read(project, blockId, 'en-GB');

    expect(await core.block.isBlock(project)).to.equal(false);
    expect(await core.block.isBlock(block)).to.equal(true);
  });

  it('should be able to get all block and element positions from used theme', async () => {
    const project = await core.project.read(projectId);
    const theme = await core.theme.read(project);
    const positions = await core.theme.getPositions(project, theme.layouts[1]);

    expect(positions.blocks[0].id).to.equal('welcome-message');
    expect(positions.blocks[0].restrictions.html).to.equal(false);
    expect(positions.elements[0].id).to.equal('welcome-image');
  });

  it('should be able to create a snapshot', async () => {
    const project = await core.project.read(projectId);
    const snapshot = await core.snapshot.create(project, 'My first snapshot');
    // Create a new block after creating the snapshot
    // to test if reverting to the snapshot deletes the block too
    const blockToRevert = await core.block.create(project, 'en-GB', 'This should be deleted after the revert');
    snapshotId = snapshot.id;
    blockToRevertId = blockToRevert.id;
  });

  it('should be able to read an snapshot', async () => {
    const project = await core.project.read(projectId);
    const snapshot = await core.snapshot.read(project, snapshotId);
    
    expect(snapshot.id).to.equal(snapshotId);
    expect(snapshot.name).to.contain('My first snapshot');
  });

  it('should be able to delete an asset', async () => {
    const project = await core.project.read(projectId);
    const asset = await core.asset.read(project, assetId, 'en-GB');
    await core.asset.delete(project, asset);

    expect(core.asset.read(project, assetId, asset.language)).to.be.rejectedWith();
    expect(await Fs.pathExists(Util.pathTo.asset(project.id, asset.id, asset.language))).to.equal(false);
    expect(await Fs.pathExists(Util.pathTo.lfsFile(project.id, asset.id, asset.language, asset.extension))).to.equal(false);
  });

  it('should be able to delete a page', async () => {
    const project = await core.project.read(projectId);
    const page = await core.page.read(project, pageId, 'en-GB');
    await core.page.delete(project, page);

    expect(core.page.read(project, pageId, page.language)).to.be.rejectedWith();
    expect(await Fs.pathExists(Util.pathTo.page(project.id, page.id, page.language))).to.equal(false);
  });

  it('should be able to delete a block', async () => {
    const project = await core.project.read(projectId);
    const block = await core.block.read(project, blockId, 'en-GB');
    await core.block.delete(project, block);

    expect(core.block.read(project, blockId, block.language)).to.be.rejectedWith();
    expect(await Fs.pathExists(Util.pathTo.block(project.id, block.id, block.language))).to.equal(false);
  });

  it('should be able to revert to an snapshot', async () => {
    const project = await core.project.read(projectId);
    const snapshot = await core.snapshot.read(project, snapshotId);
    const prevExistingBlock = await core.block.read(project, blockToRevertId, 'en-GB');
    await core.snapshot.revert(project, snapshot);
    const prevDeletedBlock = await core.block.read(project, blockId, 'en-GB');

    expect(prevDeletedBlock.id).to.equal(blockId);
    expect(core.block.read(project, prevExistingBlock.id, prevExistingBlock.language)).to.be.rejectedWith();
    expect(await Fs.pathExists(Util.pathTo.block(project.id, prevExistingBlock.id, prevExistingBlock.language))).to.equal(false);
  });

  it('should be able to list all snapshots', async () => {
    const project = await core.project.read(projectId);
    const snapshots = await core.snapshots(project);

    expect(snapshots.length).to.equal(1);
  });

  it('should be able to identify a snapshot', async () => {
    const project = await core.project.read(projectId);
    const snapshot = await core.snapshot.read(project, snapshotId);

    expect(await core.snapshot.isSnapshot(project)).to.equal(false);
    expect(await core.snapshot.isSnapshot(snapshot)).to.equal(true);
  });

  it('should be able to delete a snapshot', async () => {
    const project = await core.project.read(projectId);
    const snapshot = await core.snapshot.read(project, snapshotId);
    await core.snapshot.delete(project, snapshot);

    expect(core.snapshot.read(project, snapshotId)).to.be.rejectedWith();
  });

  // it('should be able to build a project in 5 minutes', async () => {
  //   const project = await core.project.read(projectId);
  //   await core.build(project);
  // }).timeout(300000);

  it('should be able to delete a project', async () => {
    const project = await core.project.read(anotherProjectId);
    await core.project.delete(project);

    expect(core.project.read(anotherProjectId)).to.be.rejectedWith();
    expect(await Fs.pathExists(Util.pathTo.project(project.id))).to.equal(false);
  });
});