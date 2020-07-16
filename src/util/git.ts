import Fs from 'fs-extra';
import Globby from 'globby';
import Git from 'isomorphic-git';
import Http from 'isomorphic-git/http/node';
import { assignDefaultIfMissing } from './general';

export interface GitSignature {
  name: string;
  email: string;
}

/**
 * Initializes a new repository
 */
export async function init(localPath: string, options?: Partial<Parameters<typeof Git.init>[0]>): Promise<void> {
  return Git.init(assignDefaultIfMissing(options || {}, {
    fs: Fs,
    dir: localPath
  }));
}

/**
 * Clones a repository
 */
export async function clone(url: string, localPath: string, options?: Partial<Parameters<typeof Git.clone>[0]>): Promise<void> {
  return Git.clone(assignDefaultIfMissing(options || {}, {
    fs: Fs,
    http: Http,
    url: url,
    dir: localPath
  }));
}

/**
 * Fetches and merges commits from a remote repository
 */
export async function pull(localPath: string, options?: Partial<Parameters<typeof Git.pull>[0]>): Promise<void> {
  return Git.pull(assignDefaultIfMissing(options || {}, {
    fs: Fs,
    http: Http,
    dir: localPath
  }));
}

/**
 * Adds and commits given files
 */
export async function commit(localPath: string, signature: GitSignature, files: string | string[], message: string, options?: Partial<Parameters<typeof Git.commit>[0]>): Promise<string> {

  // Support the * (add and commit everything) syntax
  if (files === '*') {
    files = await Globby(['./**', './**/.*'], {
      cwd: localPath,
      gitignore: true
    });
  }

  // Convert single string to string array for ease of use
  if (typeof files === 'string') {
    files = [files];
  }

  // The .add() method only accepts relative paths
  // so we need to remove the localPath part of it if needed
  files = files.map((file) => {
    if (file.includes(localPath)) {
      return file.replace(localPath + '/', '');
    }
    return file;
  });

  // Only commit changed files, not all of them again and again
  files = files.filter(async (file) => {
    const status = await Git.status({
      fs: Fs,
      dir: localPath,
      filepath: file
    });
    return status === '*added' || status === '*modified' || status === '*deleted';
  });

  await Promise.all(files.map(async (file) => {
    // Add all changed files to the staging area
    return Git.add({
      fs: Fs,
      dir: localPath,
      filepath: file
    });
  }));

  // Now create the commit
  return Git.commit(assignDefaultIfMissing(options || {}, {
    fs: Fs,
    dir: localPath,
    author: signature,
    message: message
  }));
}

/**
 * Checkout a branch
 * 
 * If the branch already exists it will check out that branch. 
 * Otherwise, it will create it locally and check it out after that.
 */
export async function checkout(localPath: string, name: string, isNew = false, options?: Partial<Parameters<typeof Git.checkout>[0]>): Promise<void> {
  if (isNew === true) {
    await Git.branch({
      fs: Fs,
      dir: localPath,
      ref: name
    });
  }

  return Git.checkout(assignDefaultIfMissing(options || {}, {
    fs: Fs,
    dir: localPath,
    ref: name
  }));
}

/**
 * Creates an annotated tag
 * @param id The SHA-1 object id the tag points to
 * @param name Name of the new tag
 * @param message Message describing the tag
 */
export async function tag(localPath: string, signature: GitSignature, id: string, name: string, message: string, options?: Partial<Parameters<typeof Git.annotatedTag>[0]>): Promise<void> {
  return Git.annotatedTag(assignDefaultIfMissing(options || {}, {
    fs: Fs,
    dir: localPath,
    ref: name,
    message,
    tagger: signature,
    object: id
  }));
}