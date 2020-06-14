import Path from 'path';
import Fs from 'fs';
import { Signature } from 'nodegit';
import * as Util from './util';
import * as Theme from './theme';

const folders = [
  'theme',
  'media',
  'pages',
  'blocks'
];

const gitignore = `
.DS_Store
theme/

# Keep directories with .gitkeep files in them
# even if the directory itself is ignored
!/**/.gitkeep
`;

export async function create(name: string, signature: Signature): Promise<void> {
  const slug = Util.slugify(name);
  const path = Path.join(Util.pathTo.projects, slug);

  // Create a new Git repository
  // Path is created recursively
  const repository = await Util.git.init(path);

  // Create a .gitignore file
  await Fs.promises.writeFile(Path.join(path, '.gitignore'), gitignore);

  // Create the folder structure with .gitkeep files inside them
  await Promise.all(folders.map(async (folder) => {
    await Util.mkdir(Path.join(path, folder));
    await Fs.promises.writeFile(Path.join(path, folder, '.gitkeep'), '');
  }));

  // Download the default theme
  await Theme.change(slug, 'https://github.com/Nils-Kolvenbach/website.git');

  // Create an initial commit
  await Util.git.commit(repository, signature, '*', `:tada: Created new elek.io project "${name}"`, true);

  // Now create and switch to the "stage" branch
  await Util.git.checkout(repository, 'stage', true);

  // Create the "Hello World!" page
  await Fs.promises.writeFile(Path.join(path, 'pages', 'home.json'), '{"title": "Your home page", "content": "Lorem Ipsum dolor..."}');
  await Util.git.commit(repository, signature, Path.join(path, 'pages', 'home.json'), 'Added home page');
  console.log(await Util.git.status(repository));
}
