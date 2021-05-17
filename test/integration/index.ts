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
    const project = await core.projects.create('Project 1', 'The first project');
    projectId = project.id;

    expect(project).to.have.property('name', 'Project 1');
    expect(await Fs.pathExists(Util.pathTo.project(project.id))).to.equal(true);
  }).timeout(5000);

  it('should be able to read an existing project', async () => {
    const project = await core.projects.read(projectId);

    expect(project).to.have.property('name', 'Project 1');
  });

  it('should be able to update an existing project', async () => {
    const project = await core.projects.read(projectId);
    project.name = 'Project';
    await core.projects.update(project);

    expect(await core.projects.read(project.id)).to.have.property('name', 'Project');
  });

  it('should be able to add an asset to an existing project', async () => {
    const project = await core.projects.read(projectId);
    const filePath = Path.resolve('./test/asset/300x300.png');
    const asset = await core.assets.create(filePath, project, 'en-GB', 'Asset 1', 'My first asset');
    assetId = asset.id;

    expect(asset).to.have.property('name', 'Asset 1');
    expect(await Fs.pathExists(Util.pathTo.asset(project.id, asset.id, asset.language))).to.equal(true);
    expect(await Fs.pathExists(Util.pathTo.lfsFile(project.id, asset.id, asset.language, asset.extension))).to.equal(true);
  });

  it('should be able to add a page to an existing project', async () => {
    const project = await core.projects.read(projectId);
    const theme = await core.theme.read(project);
    const page = await core.pages.create(project, 'en-GB', 'Page 1', '/test', theme.layouts[2].id);
    pageId = page.id;

    expect(page).to.have.property('name', 'Page 1');
    expect(await Fs.pathExists(Util.pathTo.page(project.id, page.id, page.language))).to.equal(true);
  });

  it('should be able to add a block to an existing project', async () => {
    const project = await core.projects.read(projectId);
    const block = await core.blocks.create(project, 'en-GB', 'Hey', '# Hello World');
    blockId = block.id;

    expect(block).to.have.property('body', '# Hello World');
    expect(await Fs.pathExists(Util.pathTo.block(project.id, block.id, block.language))).to.equal(true);
  });

  it('should throw an error when an invalid language tag is used', async () => {
    const project = await core.projects.read(projectId);
    const filePath = Path.resolve('./test/asset/300x300.png');

    expect(core.assets.create(filePath, project, 'en_US', 'Asset 1', 'My first asset')).to.be.rejectedWith(InvalidBcp47LanguageTagError).and.eventually.have.property('name', 'InvalidBcp47LanguageTagError');
  });

  it('should be able to subscribe to events', async () => {
    let counter = 0;
    core.event.on((event) => {
      expect(event).to.have.property('type', 'event');
      // console.log(event.id);
      counter++;
    });
    const project = await core.projects.create('Another Project', 'The second project');
    anotherProjectId = project.id;
    expect(counter).to.be.at.least(1);
  }).timeout(5000);

  it('should be able to load all projects from disk', async () => {
    const projects = await core.projects.list();

    expect(projects.length).to.equal(2);
  });

  it('should be able to read an asset', async () => {
    const project = await core.projects.read(projectId);
    const asset = await core.assets.read(project, assetId, 'en-GB');

    expect(asset).to.have.property('name', 'Asset 1');
  });

  it('should be able to read a page', async () => {
    const project = await core.projects.read(projectId);
    const page = await core.pages.read(project, pageId, 'en-GB');

    expect(page).to.have.property('name', 'Page 1');
  });

  it('should be able to read a block', async () => {
    const project = await core.projects.read(projectId);
    const block = await core.blocks.read(project, blockId, 'en-GB');

    expect(block).to.have.property('body', '# Hello World');
  });

  it('should be able to update an asset', async () => {
    const project = await core.projects.read(projectId);
    const asset = await core.assets.read(project, assetId, 'en-GB');
    asset.name = 'Asset';
    await core.assets.update(project, asset);

    expect(await core.assets.read(project, asset.id, asset.language)).to.have.property('name', 'Asset');
  });

  it('should be able to update a page', async () => {
    const project = await core.projects.read(projectId);
    const page = await core.pages.read(project, pageId, 'en-GB');
    page.name = 'Page';
    await core.pages.update(project, page);

    expect(await core.pages.read(project, page.id, page.language)).to.have.property('name', 'Page');
  });

  it('should be able to update a block', async () => {
    const project = await core.projects.read(projectId);
    const block = await core.blocks.read(project, blockId, 'en-GB');
    block.body = '## Hello World!';
    await core.blocks.update(project, block);

    expect(await core.blocks.read(project, block.id, block.language)).to.have.property('body', '## Hello World!');
  });

  it('should be able to load all assets from disk', async () => {
    const project = await core.projects.read(projectId);
    const assets = await core.assets.list(project);

    expect(assets.length).to.equal(1);
  });

  it('should be able to load all pages from disk', async () => {
    const project = await core.projects.read(projectId);
    const pages = await core.pages.list(project);

    expect(pages.length).to.equal(2);
  });

  it('should be able to load all block from disk', async () => {
    const project = await core.projects.read(projectId);
    const blocks = await core.blocks.list(project);

    expect(blocks.length).to.equal(2);
  });

  it('should be able to identify a project', async () => {
    const project = await core.projects.read(projectId);
    const asset = await core.assets.read(project, assetId, 'en-GB');

    expect(await core.projects.isProject(asset)).to.equal(false);
    expect(await core.projects.isProject(project)).to.equal(true);
  });

  it('should be able to identify an asset', async () => {
    const project = await core.projects.read(projectId);
    const asset = await core.assets.read(project, assetId, 'en-GB');

    expect(await core.assets.isAsset(project)).to.equal(false);
    expect(await core.assets.isAsset(asset)).to.equal(true);
  });

  it('should be able to identify a page', async () => {
    const project = await core.projects.read(projectId);
    const page = await core.pages.read(project, pageId, 'en-GB');

    expect(await core.pages.isPage(project)).to.equal(false);
    expect(await core.pages.isPage(page)).to.equal(true);
  });

  it('should be able to identify a block', async () => {
    const project = await core.projects.read(projectId);
    const block = await core.blocks.read(project, blockId, 'en-GB');

    expect(await core.blocks.isBlock(project)).to.equal(false);
    expect(await core.blocks.isBlock(block)).to.equal(true);
  });

  it('should be able to get all block and element positions from used theme', async () => {
    const project = await core.projects.read(projectId);
    const theme = await core.theme.read(project);
    const positions = await core.theme.getPositions(project, theme.layouts[1]);

    expect(positions.blocks[0].id).to.equal('welcome-message');
    expect(positions.blocks[0].restrictions.html).to.equal(false);
    expect(positions.elements[0].id).to.equal('welcome-image');
  });

  it('should be able to create a snapshot', async () => {
    const project = await core.projects.read(projectId);
    const snapshot = await core.snapshots.create(project, 'My first snapshot');
    // Create a new block after creating the snapshot
    // to test if reverting to the snapshot deletes the block too
    const blockToRevert = await core.blocks.create(project, 'en-GB', 'To delete', 'This should be deleted after the revert');
    snapshotId = snapshot.id;
    blockToRevertId = blockToRevert.id;
  });

  it('should be able to read an snapshot', async () => {
    const project = await core.projects.read(projectId);
    const snapshot = await core.snapshots.read(project, snapshotId);
    
    expect(snapshot.id).to.equal(snapshotId);
    expect(snapshot.name).to.contain('My first snapshot');
  });

  // it('should be able to delete an asset', async () => {
  //   const project = await core.projects.read(projectId);
  //   const asset = await core.assets.read(project, assetId, 'en-GB');
  //   await core.assets.delete(project, asset);

  //   expect(core.assets.read(project, assetId, asset.language)).to.be.rejectedWith();
  //   expect(await Fs.pathExists(Util.pathTo.asset(project.id, asset.id, asset.language))).to.equal(false);
  //   expect(await Fs.pathExists(Util.pathTo.lfsFile(project.id, asset.id, asset.language, asset.extension))).to.equal(false);
  // });

  it('should be able to delete a page', async () => {
    const project = await core.projects.read(projectId);
    const page = await core.pages.read(project, pageId, 'en-GB');
    await core.pages.delete(project, page);

    expect(core.pages.read(project, pageId, page.language)).to.be.rejectedWith();
    expect(await Fs.pathExists(Util.pathTo.page(project.id, page.id, page.language))).to.equal(false);
  });

  it('should be able to delete a block', async () => {
    const project = await core.projects.read(projectId);
    const block = await core.blocks.read(project, blockId, 'en-GB');
    await core.blocks.delete(project, block);

    expect(core.blocks.read(project, blockId, block.language)).to.be.rejectedWith();
    expect(await Fs.pathExists(Util.pathTo.block(project.id, block.id, block.language))).to.equal(false);
  });

  it('should be able to read the git log', async () => {
    const project = await core.projects.read(projectId);
    const logs = await core.historyLog(project);

    expect(logs.length).to.greaterThan(5);
  });

  // it('should be able to read the git log from start to parent', async () => {
  //   const project = await core.projects.read(projectId);
  //   const allLogs = await core.historyLog(project);
  //   const toParent = await core.historyLog(project, allLogs[allLogs.length - 5].hash);

  //   expect(toParent.length).to.equal(5);
  // });

  it('should be able to read the git log with options', async () => {
    const project = await core.projects.read(projectId);
    const allLogs = await core.historyLog(project);
    const limitedLogs = await core.historyLog(project, {
      limit: 3
    });
    const lastLogs = await core.historyLog(project, {
      between: {
        from: allLogs[5].hash
      }
    });
    const betweenLogs = await core.historyLog(project, {
      between: {
        from: allLogs[allLogs.length - 1].hash,
        to: allLogs[allLogs.length - 6].hash
      }
    });

    expect(limitedLogs.length).to.equal(3);
    expect(lastLogs.length).to.equal(5);
    expect(betweenLogs.length).to.equal(5);
  });

  // it('should be able to revert to an snapshot', async () => {
  //   const project = await core.projects.read(projectId);
  //   const snapshot = await core.snapshots.read(project, snapshotId);
  //   const prevExistingBlock = await core.blocks.read(project, blockToRevertId, 'en-GB');
  //   await core.snapshots.revert(project, snapshot);
  //   const prevDeletedBlock = await core.blocks.read(project, blockId, 'en-GB');
  //   const asset = await core.assets.read(project, assetId, 'en-GB');

  //   expect(prevDeletedBlock.id).to.equal(blockId);
  //   expect(core.blocks.read(project, prevExistingBlock.id, prevExistingBlock.language)).to.be.rejectedWith();
  //   expect(await Fs.pathExists(Util.pathTo.block(project.id, prevExistingBlock.id, prevExistingBlock.language))).to.equal(false);

  //   // The deleted asset should also be there again now
  //   expect(await Fs.pathExists(Util.pathTo.asset(project.id, asset.id, asset.language)), 'the previously deleted asset file to exist again').to.equal(true);
  //   // Also check the LFS folder
  //   expect(await Fs.pathExists(Util.pathTo.lfsFile(project.id, asset.id, asset.language, asset.extension)), 'the previously deleted LFS file to exist again').to.equal(true);
  // });

  it('should be able to list all snapshots', async () => {
    const project = await core.projects.read(projectId);
    const snapshots = await core.snapshots.list(project);

    expect(snapshots.length).to.equal(1);
  });

  it('should be able to identify a snapshot', async () => {
    const project = await core.projects.read(projectId);
    const snapshot = await core.snapshots.read(project, snapshotId);

    expect(await core.snapshots.isSnapshot(project)).to.equal(false);
    expect(await core.snapshots.isSnapshot(snapshot)).to.equal(true);
  });

  it('should be able to create a snapshot for a specified commit', async () => {
    const project = await core.projects.read(projectId);
    const logs = await core.historyLog(project);
    const snapshot = await core.snapshots.create(project, 'Snapshot on the second to first commit', logs[logs.length - 2]);
  });

  it('should be able to search a project for given query', async () => {
    const project = await core.projects.read(projectId);

    const results = await core.projects.search(project, 'Page');
    
    //console.log(JSON.stringify(results, null, 2));
    expect(results.length).to.equal(2);
  });

  // it('should be able to delete a snapshot', async () => {
  //   const project = await core.projects.read(projectId);
  //   const snapshot = await core.snapshots.read(project, snapshotId);
  //   await core.snapshots.delete(project, snapshot);

  //   expect(core.snapshots.read(project, snapshotId)).to.be.rejectedWith();
  // });

  // it('should be able to build a project in 5 minutes', async () => {
  //   const project = await core.projects.read(projectId);
  //   await core.build(project);
  // }).timeout(300000);

  // it('should be able to delete a project', async () => {
  //   const project = await core.projects.read(anotherProjectId);
  //   await core.projects.delete(project);

  //   expect(core.projects.read(anotherProjectId)).to.be.rejectedWith();
  //   expect(await Fs.pathExists(Util.pathTo.project(project.id))).to.equal(false);
  // });
});