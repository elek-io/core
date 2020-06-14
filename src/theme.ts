import Path from 'path';
import * as Util from './util';

export async function change(projectSlug: string, themeUrl: string) {
  const path = Path.join(Util.pathTo.projects, projectSlug, 'theme');

  // Remove the current theme
  await Util.rmrf(path);

  // Clone the theme into the projects theme folder
  // Unfortunately there is no shallow clone integration
  // in nodegit and the underlying libgit2 yet.
  // See: https://github.com/libgit2/libgit2/issues/3058
  // Otherwise we could just clone the current version
  // without the history overhead
  await Util.git.clone(themeUrl, path);
}

export async function update(projectSlug: string) {
  const path = Path.join(Util.pathTo.projects, projectSlug, 'theme');

  // Update the theme by pulling
  await Util.git.pull(path);
}
