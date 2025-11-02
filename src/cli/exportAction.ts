import Path from 'path';
import Fs from 'fs-extra';
import type { ExportProjectsProps, ExportProps } from '../schema/index.js';
import { core, watchProjects } from './index.js';

async function exportProjects({ outDir }: ExportProjectsProps) {
  const resolvedOutDir = Path.resolve(outDir);
  await Fs.ensureDir(resolvedOutDir);
  let content = {};

  const projects = await core.projects.list({ limit: 0 });

  for (const project of projects.list) {
    const assets = (await core.assets.list({ projectId: project.id, limit: 0 }))
      .list;
    let assetContent = {};
    for (const asset of assets) {
      assetContent = { ...assetContent, [asset.id]: { ...asset } };
    }

    let collectionContent = {};
    const collections = (
      await core.collections.list({ projectId: project.id, limit: 0 })
    ).list;
    for (const collection of collections) {
      let entryContent = {};
      const entries = (
        await core.entries.list({
          projectId: project.id,
          collectionId: collection.id,
          limit: 0,
        })
      ).list;
      for (const entry of entries) {
        entryContent = { ...entryContent, [entry.id]: { ...entry } };
      }

      collectionContent = {
        ...collectionContent,
        [collection.id]: { ...collection, entries: entryContent },
      };
    }

    content = {
      ...content,
      [project.id]: {
        ...project,
        assets: assetContent,
        collections: collectionContent,
      },
    };
  }

  await Fs.writeFile(
    Path.join(resolvedOutDir, 'projects.json'),
    JSON.stringify(content, null, 2)
  );
}

export const exportAction = async ({ outDir, options }: ExportProps) => {
  await exportProjects({ outDir });

  if (options.watch === true) {
    core.logger.info({
      source: 'core',
      message: 'Watching for changes to export Projects',
    });

    watchProjects().on('all', (event, path) => {
      core.logger.info({
        source: 'core',
        message: `Re-Exporting Projects due to ${event} on "${path}"`,
      });
      void exportProjects({ outDir });
    });
  }
};
