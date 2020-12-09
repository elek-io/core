import Fs from 'fs-extra';
import Globby from 'globby';
import Git, { ReadTagResult } from 'isomorphic-git';
import Http from 'isomorphic-git/http/node';
import { GitSignature } from '../../type/general';
import { assignDefaultIfMissing } from './general';

/**
 * Initializes a new repository
 */
export async function init(localPath: string, options?: Partial<Parameters<typeof Git.init>[0]>): Promise<void> {
  return await Git.init(assignDefaultIfMissing(options, {
    fs: Fs,
    dir: localPath
  }));
}

/**
 * Clones a repository
 */
export async function clone(url: string, localPath: string, options?: Partial<Parameters<typeof Git.clone>[0]>): Promise<void> {
  return await Git.clone(assignDefaultIfMissing(options, {
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
  return await Git.pull(assignDefaultIfMissing(options, {
    fs: Fs,
    http: Http,
    dir: localPath
  }));
}

/**
 * Normalizes given files into string array and 
 * adds support for "*" and "." patterns
 */
async function parseFileInput(localPath: string, files: string | string[]): Promise<string[]> {
  // Support the * and . (add and commit everything) syntax
  if (files === '*' || files === '.') {
    files = await Globby(['./**', './**/.*'], {
      cwd: localPath,
      gitignore: true
    });
  }

  // Convert single string to string array for ease of use
  if (typeof files === 'string') {
    files = [files];
  }

  return files;
}

/**
 * Returns a relative path by removing the localPath from file 
 */
function getRelativePath(localPath: string, file: string): string {
  if (file.includes(localPath)) {
    file = file.replace(localPath + '/', '');
  }
  return file;
}

/**
 * Adds and commits given files
 */
export async function commit(localPath: string, signature: GitSignature, files: string | string[], message: string, options?: Partial<Parameters<typeof Git.commit>[0]>): Promise<string> {
  const filesStatus = await status(localPath, files);

  // Add all changes to the staging area
  await Promise.all(filesStatus.map(async (file) => {
    /**
     * The explicit removal of a deleted but not yet staged file 
     * is not needed via git CLI. 
     * 
     * If this will be handled by isomorphic-git in the future,
     * this can be simplified.
     * @see https://github.com/isomorphic-git/isomorphic-git/issues/1099#issuecomment-659700768
     */
    if (file.status === '*deleted') {
      await Git.remove({
        fs: Fs,
        dir: localPath,
        filepath: file.path
      });
    } else if (file.status === '*added' || file.status === '*modified') {
      await Git.add({
        fs: Fs,
        dir: localPath,
        filepath: file.path
      });
    }
  }));

  // Now create the commit
  return await Git.commit(assignDefaultIfMissing(options, {
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

  return await Git.checkout(assignDefaultIfMissing(options, {
    fs: Fs,
    dir: localPath,
    ref: name
  }));
}

/**
 * Returns the absolute path of given files together with their git status
 */
export async function status(localPath: string, files: string | string[]) {
  files = await parseFileInput(localPath, files);
  
  // Get the status of each file
  return await Promise.all(files.map(async (file) => {
    // The .status() method only accepts relative paths
    // so we need to remove the localPath part of it if needed
    file = getRelativePath(localPath, file);
    return {
      path: file,
      status: await Git.status({
        fs: Fs,
        dir: localPath,
        filepath: file
      })
    };
  }));
}

export const tag = {
  /**
   * Creates an annotated tag
   * 
   * @param id A self specified ID (e.g. Uuid v4) which needs to meet the same criteria of a slug
   * @param name Name of the new tag (internally handled as the tag's message)
   */
  create: async (localPath: string, signature: GitSignature, id: string, name: string, options?: Partial<Parameters<typeof Git.annotatedTag>[0]>): Promise<ReadTagResult> => {
    await Git.annotatedTag(assignDefaultIfMissing(options, {
      fs: Fs,
      dir: localPath,
      ref: id,
      message: name,
      tagger: signature
    }));
    return await tag.load(localPath, id);
  },
  load: async (localPath: string, id: string): Promise<ReadTagResult> => {
    // Resolve the oid by the tag's reference (in our case a self specified ID)
    const tagObjectId = await Git.resolveRef({
      fs: Fs,
      dir: localPath,
      ref: id
    });
    // Use this oid to get the tag's full information
    return await Git.readTag({
      fs: Fs,
      dir: localPath,
      oid: tagObjectId
    });
  },
  list: async (localPath: string): Promise<ReadTagResult[]> => {
    const tagIds = await Git.listTags({
      fs: Fs,
      dir: localPath
    });

    return await Promise.all(tagIds.map(async (id) => {
      return tag.load(localPath, id);
    }));
  },
  delete: async (localPath: string, id: string): Promise<void> => {
    return await Git.deleteTag({
      fs: Fs,
      dir: localPath,
      ref: id
    });
  }
};