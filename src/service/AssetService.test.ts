import Fs from 'fs-extra';
import Os from 'os';
import Path from 'path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import core, { type Asset, type Project } from '../test/setup.js';
import {
  createAsset,
  createProject,
  ensureCleanGitStatus,
  getFileHash,
} from '../test/util.js';

describe.sequential('Integration', function () {
  let project: Project & { destroy: () => Promise<void> };
  let asset: Asset;

  beforeAll(async function () {
    project = await createProject();
  });

  afterAll(async function () {
    await project.destroy();
  });

  afterEach(async function ({ task }) {
    await ensureCleanGitStatus(task, project.id);
  });

  it.sequential('should be able to create a new Asset', async function () {
    asset = await createAsset(project.id);

    expect(asset.id).to.not.be.undefined;
    expect(
      Math.floor(new Date(asset.created).getTime() / 1000)
    ).to.approximately(Math.floor(Date.now() / 1000), 5); // 5 seconds of delta allowed
    expect(asset.extension).to.equal('png');
    expect(asset.mimeType).to.equal('image/png');
    expect(asset.history.length).to.equal(1);
    expect(
      await Fs.pathExists(core.util.pathTo.assetFile(project.id, asset.id)),
      'the AssetFile to be created for saving additional meta data of the Asset'
    ).to.be.true;
    expect(
      await Fs.pathExists(
        core.util.pathTo.asset(project.id, asset.id, asset.extension)
      ),
      'the Asset to be copied into the LFS directory of the Project'
    ).to.be.true;
    expect(
      await getFileHash(asset.absolutePath),
      'the copied file hash'
    ).to.equal(
      await getFileHash(Path.resolve('src/test/data/150x150.png')),
      'the original file hash'
    );
  });

  it.sequential('should be able to read an Asset', async function () {
    const readAsset = await core.assets.read({
      projectId: project.id,
      id: asset.id,
    });

    expect(readAsset.name).to.equal(asset.name);
  });

  it.sequential('should be able to update an Asset', async function () {
    asset.description = 'A 150x150 image of the text "elek.io"';
    asset = await core.assets.update({
      projectId: project.id,
      ...asset,
    });

    expect(asset.description).to.equal('A 150x150 image of the text "elek.io"');
    expect(asset.history.length).to.equal(2);
  });

  it.sequential(
    'should be able to update an Asset with a new file',
    async function () {
      const newFilePath = Path.resolve('src/test/data/150x150.jpeg');
      asset = await core.assets.update({
        projectId: project.id,
        ...asset,
        newFilePath,
      });

      expect(asset.extension).to.equal('jpeg');
      expect(asset.size).to.equal(1342);
      expect(asset.history.length).to.equal(3);
    }
  );

  it.sequential(
    'should be able to get an Asset of a specific commit',
    async function () {
      const commitHash = asset.history.at(-1)?.hash;

      if (!commitHash) {
        throw new Error('No commit hash found');
      }

      const assetFromHistory = await core.assets.read({
        projectId: project.id,
        id: asset.id,
        commitHash: commitHash,
      });

      expect(assetFromHistory.extension).to.equal('png');
      expect(assetFromHistory.mimeType).to.equal('image/png');
      expect(
        assetFromHistory.absolutePath.startsWith(core.util.pathTo.tmp)
      ).to.equal(true);
      expect(
        await Fs.pathExists(
          core.util.pathTo.tmpAsset(
            assetFromHistory.id,
            commitHash,
            assetFromHistory.extension
          )
        ),
        'the Asset to be copied into the tmp directory'
      ).to.be.true;
      expect(
        await getFileHash(assetFromHistory.absolutePath),
        'the copied file hash'
      ).to.equal(
        await getFileHash(Path.resolve('src/test/data/150x150.png')),
        'the original file hash'
      );
    }
  );

  it.sequential(
    'should be able to get the same Asset from multiple commits',
    async function () {
      const previousCommitHash = asset.history.at(-1)?.hash;
      const currentCommitHash = asset.history.shift()?.hash;

      if (!previousCommitHash || !currentCommitHash) {
        throw new Error('No commit hash found');
      }

      const previousAssetFromHistory = await core.assets.read({
        projectId: project.id,
        id: asset.id,
        commitHash: previousCommitHash,
      });

      const currentAssetFromHistory = await core.assets.read({
        projectId: project.id,
        id: asset.id,
        commitHash: currentCommitHash,
      });

      expect(previousAssetFromHistory.extension).to.equal('png');
      expect(previousAssetFromHistory.mimeType).to.equal('image/png');
      expect(
        previousAssetFromHistory.absolutePath.startsWith(core.util.pathTo.tmp)
      ).to.equal(true);
      expect(
        await Fs.pathExists(
          core.util.pathTo.tmpAsset(
            previousAssetFromHistory.id,
            previousCommitHash,
            previousAssetFromHistory.extension
          )
        ),
        'the Asset to be copied into the tmp directory'
      ).to.be.true;
      expect(
        await getFileHash(previousAssetFromHistory.absolutePath),
        'the copied file hash'
      ).to.equal(
        await getFileHash(Path.resolve('src/test/data/150x150.png')),
        'the original file hash'
      );

      expect(currentAssetFromHistory.extension).to.equal('jpeg');
      expect(currentAssetFromHistory.mimeType).to.equal('image/jpeg');
      expect(
        currentAssetFromHistory.absolutePath.startsWith(core.util.pathTo.tmp)
      ).to.equal(true);
      expect(
        await Fs.pathExists(
          core.util.pathTo.tmpAsset(
            currentAssetFromHistory.id,
            currentCommitHash,
            currentAssetFromHistory.extension
          )
        ),
        'the Asset to be copied into the tmp directory'
      ).to.be.true;
      expect(
        await getFileHash(currentAssetFromHistory.absolutePath),
        'the copied file hash'
      ).to.equal(
        await getFileHash(Path.resolve('src/test/data/150x150.jpeg')),
        'the original file hash'
      );
    }
  );

  it.sequential(
    'should be able to save the current Asset version on disk',
    async function () {
      const filePathToSaveTo = Path.join(Os.homedir(), `saved-asset.jpg`);

      await core.assets.save({
        projectId: project.id,
        id: asset.id,
        filePath: filePathToSaveTo,
      });

      expect(
        await Fs.pathExists(filePathToSaveTo),
        'the Asset to be copied into given directory'
      ).to.be.true;
      expect(
        await getFileHash(filePathToSaveTo),
        'the copied file hash'
      ).to.equal(
        await getFileHash(asset.absolutePath),
        'the original file hash'
      );
    }
  );

  it.sequential(
    'should be able to save an Asset from history on disk',
    async function () {
      const filePathToSaveToFromHistory = Path.join(
        Os.homedir(),
        `saved-asset-from-history.png`
      );

      await core.assets.save({
        projectId: project.id,
        id: asset.id,
        commitHash: asset.history.at(-1)?.hash,
        filePath: filePathToSaveToFromHistory,
      });

      expect(
        await Fs.pathExists(filePathToSaveToFromHistory),
        'the Asset to be copied into given directory'
      ).to.be.true;
      expect(
        await getFileHash(filePathToSaveToFromHistory),
        'the copied file hash'
      ).to.equal(
        await getFileHash(Path.resolve('src/test/data/150x150.png')),
        'the original file hash'
      );
    }
  );

  it.sequential('should be able to list all Assets', async function () {
    const assets = await core.assets.list({ projectId: project.id });

    expect(assets.total).to.equal(1);
    expect(assets.list.find((a) => a.id === asset.id)?.id).to.equal(asset.id);
  });

  it.sequential('should be able to count all Assets', async function () {
    const counted = await core.assets.count({ projectId: project.id });

    expect(counted).to.equal(1);
  });

  it.sequential('should be able to identify an Asset', async function () {
    expect(core.assets.isAsset(asset)).to.be.true;
    expect(core.assets.isAsset({ objectType: 'asset' })).to.be.false;
  });

  it.sequential('should be able to delete an Asset', async function () {
    await core.assets.delete({ projectId: project.id, ...asset });

    expect(
      await Fs.pathExists(
        core.util.pathTo.asset(project.id, asset.id, asset.extension)
      )
    ).to.be.false;
    expect(
      await Fs.pathExists(core.util.pathTo.assetFile(project.id, asset.id))
    ).to.be.false;
  });
});
