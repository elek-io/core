import ElekIoCore from './index';

(async () => {
  const core = new ElekIoCore();
  const project = await core.project.create('Test project', 'My first project');
  const asset = await core.asset.create('/path/to/file.png', project, 'de-DE', 'My file', 'The first file added to LFS');
  asset.language = 'en-US';
  asset.id = 'da';
  await core.asset.update(project, asset);
  const assets = await core.assets(project);
});
