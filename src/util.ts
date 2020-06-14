import Os from 'os';
import Util from 'util';
import Path from 'path';
import Slugify from 'slugify';
import Rimraf from 'rimraf';
import Mkdirp from 'mkdirp';
import Git from 'nodegit';

const workingDirectory = Os.homedir();

export const pathTo = {
  projects: Path.join(workingDirectory, 'projects'),
};

export function slugify(string: string): string {
  return Slugify(string, {
    replacement: '-',  // replace spaces with replacement character, defaults to `-`
    remove: undefined, // remove characters that match regex, defaults to `undefined`
    lower: true,       // convert to lower case, defaults to `false`
    strict: true,     // strip special characters except replacement, defaults to `false`
  });
}

export function mkdir(path: string): Promise<string | undefined> {
  return Mkdirp(path);
}

export function rmrf(path: string): Promise<void> {
  return Util.promisify(Rimraf)(path);
}

export const git = {
  init: (path: string): Promise<Git.Repository> => {
    return Git.Repository.init(path, 0);
  },
  clone: (url: string, localPath: string, options?: Git.CloneOptions): Promise<Git.Repository> => {
    return Git.Clone.clone(url, localPath, options);
  },
  pull: async (repository: Git.Repository | string): Promise<Git.Oid> => {
    // Check if we need to resolve that repository
    if (typeof repository === 'string') {
      repository = await Git.Repository.open(repository);
    }

    await repository.fetchAll();
    return repository.mergeBranches('master', 'origin/master');
  },
  commit: async (repository: Git.Repository, signature: Git.Signature, files: string | string[], message: string, isInit = false): Promise<Git.Oid> => {
    const index = await repository.refreshIndex();
    await index.addAll(files);
    index.write();
    const oid = await index.writeTree();

    if (isInit === true) {
      // Since we're creating an inital commit, it has no parents. Note that unlike
      // normal we don't get the head either, because there isn't one yet.
      return repository.createCommit('HEAD', signature, signature, message, oid, []);
    }

    // For normal commits we need the current HEAD as a parent
    // const head = await Git.Reference.nameToId(repository, 'HEAD');
    const parent = await repository.getHeadCommit();

    return repository.createCommit('HEAD', signature, signature, message, oid, [parent]);
  },
  status: (repository: Git.Repository): Promise<Git.StatusFile[]> => {
    return repository.getStatus();
  },
  checkout: async (repository: Git.Repository, name: string, isNew = false): Promise<Git.Reference> => {
    if (isNew === true) {
      await repository.createBranch(name, await repository.getHeadCommit());
    }
    return repository.checkoutBranch(name);
  },
  open: (path: string): Promise<Git.Repository> => {
    return Git.Repository.open(path);
  },
  discover: (path: string): Promise<Git.Buf> => {
    return Git.Repository.discover(path, 0, '');
  }
};
