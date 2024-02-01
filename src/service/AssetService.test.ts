import type { Asset, Project } from '@elek-io/shared';
import Fs from 'fs-extra';
import Path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import core from '../test/setup.js';
import { createAsset, createProject, getFileHash } from '../test/util.js';

describe.sequential('Integration', function () {
  let project: Project & { destroy: () => Promise<void> };
  let asset: Asset;

  beforeAll(async function () {
    project = await createProject();
  });

  afterAll(async function () {
    await project.destroy();
  });

  it.sequential('should be able to create a new Asset', async function () {
    asset = await createAsset(project.id);

    expect(asset.id).to.not.be.undefined;
    expect(asset.created).to.approximately(Math.floor(Date.now() / 1000), 5); // 5 seconds of delta allowed
    expect(asset.extension).to.equal('png');
    expect(asset.mimeType).to.equal('image/png');
    expect(
      await Fs.pathExists(
        core.util.pathTo.assetFile(project.id, asset.id, asset.language)
      ),
      'the AssetFile to be created for saving additional meta data of the Asset'
    ).to.be.true;
    expect(
      await Fs.pathExists(
        core.util.pathTo.asset(
          project.id,
          asset.id,
          asset.language,
          asset.extension
        )
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
      language: asset.language,
    });

    expect(readAsset.name).to.equal(asset.name);
  });

  it.sequential('should be able to update an Asset', async function () {
    asset.description = 'A 150x150 image of the text "elek.io"';
    const updatedAsset = await core.assets.update({
      projectId: project.id,
      ...asset,
    });

    expect(updatedAsset.description).to.equal(
      'A 150x150 image of the text "elek.io"'
    );
  });

  it.sequential('should be able to list all Assets', async function () {
    const assets = await core.assets.list({ projectId: project.id });

    expect(assets.list.length).to.equal(1);
    expect(assets.total).to.equal(1);
    expect(assets.list.find((a) => a.id === asset.id)?.id).to.equal(asset.id);
  });

  it.sequential('should be able to count all Assets', async function () {
    const counted = await core.assets.count({ projectId: project.id });

    expect(counted).to.equal(1);
  });

  it.sequential('should be able to identify an Asset', async function () {
    expect(core.assets.isAsset(asset)).to.be.true;
    expect(core.assets.isAsset({ fileType: 'asset' })).to.be.false;
  });

  it.sequential('should be able to delete an Asset', async function () {
    await core.assets.delete({ projectId: project.id, ...asset });

    expect(
      await Fs.pathExists(
        core.util.pathTo.asset(
          project.id,
          asset.id,
          asset.language,
          asset.extension
        )
      )
    ).to.be.false;
    expect(
      await Fs.pathExists(
        core.util.pathTo.assetFile(project.id, asset.id, asset.language)
      )
    ).to.be.false;
  });
});
