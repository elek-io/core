import Path from 'path';
import Fs from 'fs-extra';
import type {
  Asset,
  Collection,
  Entry,
  ExportProps,
  Project,
} from '../schema/index.js';
import { core, watchProjects } from './index.js';

async function exportProjects({ outDir, projects, options }: ExportProps) {
  const projectsToExport: Project[] = [];
  const resolvedOutDir = Path.resolve(outDir);
  await Fs.ensureDir(resolvedOutDir);
  let content: Record<
    string,
    Project & {
      assets: Record<string, Asset>;
      collections: Record<
        string,
        Collection & {
          entries: Record<string, Entry>;
        }
      >;
    }
  > = {};

  if (projects === 'all') {
    projectsToExport.push(...(await core.projects.list({ limit: 0 })).list);
  } else {
    for (const projectId of projects) {
      projectsToExport.push(await core.projects.read({ id: projectId }));
    }
  }

  for (const project of projectsToExport) {
    const assets = (await core.assets.list({ projectId: project.id, limit: 0 }))
      .list;
    let assetContent = {};
    for (const asset of assets) {
      assetContent = { ...assetContent, [asset.id]: { ...asset } };
    }

    let collectionContent: Record<
      string,
      Collection & {
        entries: Record<string, Entry>;
      }
    > = {};
    const collections = (
      await core.collections.list({ projectId: project.id, limit: 0 })
    ).list;
    for (const collection of collections) {
      let entryContent: Record<string, Entry> = {};
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

  if (options.separate === true) {
    for (const project of projectsToExport) {
      await Fs.writeFile(
        Path.join(resolvedOutDir, `project-${project.id}.json`),
        JSON.stringify(content[project.id], null, 2)
      );
    }
  } else {
    await Fs.writeFile(
      Path.join(resolvedOutDir, 'projects.json'),
      JSON.stringify(content, null, 2)
    );
  }
}

export const exportAction = async ({
  outDir,
  projects,
  options,
}: ExportProps) => {
  await exportProjects({ outDir, projects, options });

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
      void exportProjects({ outDir, projects, options });
    });
  }
};
