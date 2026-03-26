import Path from 'node:path';
import Fs from 'fs-extra';
import type {
  Asset,
  Collection,
  Component,
  Entry,
  ExportProps,
  Project,
} from '../schema/index.js';
import { core, watchProjects } from './index.js';

async function exportFile({
  resolvedOutDir,
  name,
  content,
}: {
  resolvedOutDir: string;
  options: ExportProps['options'];
  name: string;
  content: unknown;
}) {
  await Fs.writeFile(
    Path.join(resolvedOutDir, `${name}.json`),
    JSON.stringify(content, null, 2)
  );
}

async function exportProjectNested({
  projectToExport,
}: {
  resolvedOutDir: string;
  projectToExport: Project;
  options: ExportProps['options'];
}): Promise<
  Project & {
    assets: Record<string, Asset>;
    components: Record<string, Component>;
    collections: Record<
      string,
      Collection & {
        entries: Record<string, Entry>;
      }
    >;
  }
> {
  const assetsResult = await core.assets.list({ projectId: projectToExport.id, limit: 0 });
  if (assetsResult.isErr()) {
    console.error(assetsResult.error.message);
    process.exit(1);
  }
  const assets = assetsResult.value.list;
  let assetContent = {};
  for (const asset of assets) {
    assetContent = { ...assetContent, [asset.id]: { ...asset } };
  }

  let componentContent: Record<string, Component> = {};
  const componentsResult = await core.components.list({ projectId: projectToExport.id, limit: 0 });
  if (componentsResult.isErr()) {
    console.error(componentsResult.error.message);
    process.exit(1);
  }
  const components = componentsResult.value.list;
  for (const component of components) {
    componentContent = {
      ...componentContent,
      [component.slug]: { ...component },
    };
  }

  let collectionContent: Record<
    string,
    Collection & {
      entries: Record<string, Entry>;
    }
  > = {};
  const collectionsResult = await core.collections.list({ projectId: projectToExport.id, limit: 0 });
  if (collectionsResult.isErr()) {
    console.error(collectionsResult.error.message);
    process.exit(1);
  }
  const collections = collectionsResult.value.list;
  for (const collection of collections) {
    let entryContent: Record<string, Entry> = {};
    const entriesResult = await core.entries.list({
      projectId: projectToExport.id,
      collectionId: collection.id,
      limit: 0,
    });
    if (entriesResult.isErr()) {
      console.error(entriesResult.error.message);
      process.exit(1);
    }
    const entries = entriesResult.value.list;
    for (const entry of entries) {
      entryContent = { ...entryContent, [entry.id]: { ...entry } };
    }

    collectionContent = {
      ...collectionContent,
      [collection.slug.plural]: { ...collection, entries: entryContent },
    };
  }

  return {
    ...projectToExport,
    assets: assetContent,
    components: componentContent,
    collections: collectionContent,
  };
}

async function exportProjectsNested({
  resolvedOutDir,
  projectsToExport,
  options,
}: {
  resolvedOutDir: string;
  projectsToExport: Project[];
  options: ExportProps['options'];
}) {
  if (projectsToExport.length === 1) {
    const projectToExport = projectsToExport[0] as Project;
    const project = await exportProjectNested({
      resolvedOutDir,
      projectToExport,
      options,
    });
    await exportFile({
      resolvedOutDir,
      options,
      name: `project-${projectToExport.id}`,
      content: project,
    });
  } else {
    let projects: Record<
      string,
      Awaited<ReturnType<typeof exportProjectNested>>
    > = {};
    for (const project of projectsToExport) {
      projects = {
        ...projects,
        [project.id]: await exportProjectNested({
          resolvedOutDir,
          projectToExport: project,
          options,
        }),
      };
    }
    await exportFile({
      resolvedOutDir,
      options,
      name: 'projects',
      content: projects,
    });
  }
}

async function exportProjectsSeparate({
  resolvedOutDir,
  projectsToExport,
  options,
}: {
  resolvedOutDir: string;
  projectsToExport: Project[];
  options: ExportProps['options'];
}) {
  for (const project of projectsToExport) {
    const projectOutDir = Path.join(resolvedOutDir, `project-${project.id}`);
    await Fs.ensureDir(projectOutDir);

    await exportFile({
      resolvedOutDir: projectOutDir,
      options,
      name: `project`,
      content: project,
    });

    const tmpAssetsResult = await core.assets.list({ projectId: project.id, limit: 0 });
    if (tmpAssetsResult.isErr()) {
      console.error(tmpAssetsResult.error.message);
      process.exit(1);
    }
    const tmpAssets = tmpAssetsResult.value.list;
    const assets: Asset[] = [];
    const assetOutDir = Path.join(projectOutDir, 'assets');
    await Fs.ensureDir(assetOutDir);
    for (const asset of tmpAssets) {
      const assetDestination = Path.join(
        assetOutDir,
        `${asset.id}.${asset.extension}`
      );
      await Fs.copyFile(asset.absolutePath, assetDestination);
      assets.push({
        ...asset,
        absolutePath: assetDestination,
      });
    }
    await exportFile({
      resolvedOutDir: assetOutDir,
      options,
      name: `assets`,
      content: assets,
    });

    const separateComponentsResult = await core.components.list({ projectId: project.id, limit: 0 });
    if (separateComponentsResult.isErr()) {
      console.error(separateComponentsResult.error.message);
      process.exit(1);
    }
    const components = separateComponentsResult.value.list;
    const componentsOutDir = Path.join(projectOutDir, 'components');
    await Fs.ensureDir(componentsOutDir);
    for (const component of components) {
      await exportFile({
        resolvedOutDir: componentsOutDir,
        options,
        name: component.slug,
        content: component,
      });
    }
    await exportFile({
      resolvedOutDir: componentsOutDir,
      options,
      name: 'components',
      content: components,
    });

    const separateCollectionsResult = await core.collections.list({ projectId: project.id, limit: 0 });
    if (separateCollectionsResult.isErr()) {
      console.error(separateCollectionsResult.error.message);
      process.exit(1);
    }
    const collections = separateCollectionsResult.value.list;
    const collectionsOutDir = Path.join(projectOutDir, 'collections');
    await Fs.ensureDir(collectionsOutDir);
    for (const collection of collections) {
      const collectionOutDir = Path.join(
        collectionsOutDir,
        collection.slug.plural
      );
      await Fs.ensureDir(collectionOutDir);
      await exportFile({
        resolvedOutDir: collectionOutDir,
        options,
        name: `collection`,

        content: collection,
      });
      const separateEntriesResult = await core.entries.list({
        projectId: project.id,
        collectionId: collection.id,
        limit: 0,
      });
      if (separateEntriesResult.isErr()) {
        console.error(separateEntriesResult.error.message);
        process.exit(1);
      }
      const entries = separateEntriesResult.value.list;
      await exportFile({
        resolvedOutDir: collectionOutDir,
        options,
        name: `entries`,
        content: entries,
      });
    }
    await exportFile({
      resolvedOutDir: collectionsOutDir,
      options,
      name: `collections`,

      content: collections,
    });
  }
}

async function exportProjects({
  outDir,
  projects,
  template,
  options,
}: ExportProps) {
  const projectsToExport: Project[] = [];
  const resolvedOutDir = Path.resolve(outDir);
  await Fs.ensureDir(resolvedOutDir);

  if (projects === 'all') {
    const projectsListResult = await core.projects.list({ limit: 0 });
    if (projectsListResult.isErr()) {
      console.error(projectsListResult.error.message);
      process.exit(1);
    }
    projectsToExport.push(...projectsListResult.value.list);
  } else {
    for (const projectId of projects) {
      const projectResult = await core.projects.read({ id: projectId });
      if (projectResult.isErr()) {
        console.error(projectResult.error.message);
        process.exit(1);
      }
      projectsToExport.push(projectResult.value);
    }
  }

  switch (template) {
    case 'nested':
      await exportProjectsNested({
        resolvedOutDir,
        projectsToExport,
        options,
      });
      break;
    case 'separate':
      await exportProjectsSeparate({
        resolvedOutDir,
        projectsToExport,
        options,
      });
      break;
  }
}

export const exportAction = async ({
  outDir,
  projects,
  template,
  options,
}: ExportProps) => {
  await exportProjects({ outDir, projects, template, options });

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
      void exportProjects({ outDir, projects, template, options });
    });
  }
};
