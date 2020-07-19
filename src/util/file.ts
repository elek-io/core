import Os from 'os';
import Fs from 'fs-extra';
import Path from 'path';
import { hasKeysOf } from './general';
import { locale } from './validate';
import { ProjectConfig } from '../project';
import { ThemeConfig } from '../theme';
import { PageConfig } from '../page';
import { BlockConfig } from '../block';

/**
 * The directory in which everything is stored and will be worked in
 */
export const workingDirectory = Path.join(Os.homedir(), 'elek.io');

/**
 * A collection of often used paths
 */
export const pathTo = {
  projects: Path.join(workingDirectory, 'projects')
};

/**
 * A collection of config file names
 */
export const configNameOf = {
  project: 'elek.project.json',
  theme: 'package.json'
};

/**
 * JSON file helper
 */
export const json = {
  /**
   * Reads the content of given file and returnes parsed JSON
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  read: async (path: string): Promise<any> => {
    const content = await Fs.readFile(path);
    return JSON.parse(content.toString());
  },
  /**
   * Reads the header of given buffer and returnes parsed JSON
   * 
   * Used to extract JSON headers from markdown files
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readHeader: async (buffer: Buffer): Promise<any | undefined> => {
    const content = buffer.toString();
    if (content.startsWith('---') === false) {
      throw new Error('File contained no JSON header');
    }
    const header = content.substring(
      content.indexOf('---') + 3, 
      content.lastIndexOf('---')
    );
    return JSON.parse(header);
  },
  /**
   * Writes JSON in human readable format to given file
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  write: async (path: string, content: any): Promise<void> => {
    await Fs.writeFile(path, JSON.stringify(content, null, 2));
  }
};

/**
 * Read file helper
 */
export const read = {
  /**
   * Reads a project config file and returns it's JSON
   */
  project: async (projectId: string): Promise<ProjectConfig> => {
    const path = Path.join(pathTo.projects, projectId, configNameOf.project);
    const content = await json.read(path);
    const missingKeys = hasKeysOf(content, new ProjectConfig());
    if (missingKeys !== true) {
      throw new Error(`Project config "${path}" is missing required keys: ${missingKeys.join(', ')}`);
    }
    return content;
  },
  /**
   * Reads a theme config file and returns it's JSON
   */
  theme: async (projectId: string): Promise<ThemeConfig> => {
    const path = Path.join(pathTo.projects, projectId, 'theme', configNameOf.theme);
    const content = await json.read(path);
    const missingKeys = hasKeysOf(content, new ThemeConfig());
    if (missingKeys !== true) {
      throw new Error(`Theme config "${path}" is missing required keys: ${missingKeys.join(', ')}`);
    }
    return content;
  },
  /**
   * Reads a page config file and returns it's JSON
   */
  page: async (projectId: string, pageId: string, language: string): Promise<PageConfig> => {
    if (locale(language) !== true) {
      throw new Error(`Tried to read an page with invalid language tag "${language}"`);
    }
    const path = Path.join(pathTo.projects, projectId, 'pages', `${pageId}.${language}.json`);
    const content = await json.read(path);
    const missingKeys = hasKeysOf(content, new PageConfig());
    if (missingKeys !== true) {
      throw new Error(`Page config "${path}" is missing required keys: ${missingKeys.join(', ')}`);
    }
    return content;
  },
  block: async (projectId: string, blockId: string, language: string): Promise<{ config: BlockConfig, content: string }> => {
    if (locale(language) !== true) {
      throw new Error(`Tried to read an block with invalid language tag "${language}"`);
    }
    const path = Path.join(pathTo.projects, projectId, 'blocks', `${blockId}.${language}.md`);
    const content = await Fs.readFile(path);
    const header = await json.readHeader(content);
    const missingKeys = hasKeysOf(header, new BlockConfig());
    if (missingKeys !== true) {
      throw new Error(`Block config "${path}" is missing required keys: ${missingKeys.join(', ')}`);
    }
    return {
      config: header,
      content: content.toString().substring(content.toString().lastIndexOf('---') + 3)
    };
  }
};

/**
 * Write file helper
 */
export const write = {
  /**
   * Writes to a project's config file
   */
  project: async (projectId: string, config: ProjectConfig): Promise<void> => {
    const missingKeys = hasKeysOf(config, new ProjectConfig());
    if (missingKeys !== true) {
      throw new Error(`Tried to write invalid project config. Missing required keys: ${missingKeys.join(', ')}`);
    }
    await json.write(Path.join(pathTo.projects, projectId, configNameOf.project), config);
  },
  /**
   * Writes to a theme's config file
   */
  theme: async (projectId: string, config: ThemeConfig): Promise<void> => {
    const missingKeys = hasKeysOf(config, new ThemeConfig());
    if (missingKeys !== true) {
      throw new Error(`Tried to write invalid theme config. Missing required keys: ${missingKeys.join(', ')}`);
    }
    await json.write(Path.join(pathTo.projects, projectId, 'theme', configNameOf.theme), config);
  },
  /**
   * Writes to a page's config file
   */
  page: async (projectId: string, pageId: string, language: string, config: PageConfig): Promise<void> => {
    if (locale(language) !== true) {
      throw new Error(`Tried to write an page with invalid language tag "${language}"`);
    }
    const missingKeys = hasKeysOf(config, new PageConfig());
    if (missingKeys !== true) {
      throw new Error(`Tried to write invalid page config. Missing required keys: ${missingKeys.join(', ')}`);
    }
    await json.write(Path.join(pathTo.projects, projectId, 'pages', `${pageId}.${language}.json`), config);
  },
  /**
   * Writes to a block's config header and content
   */
  block: async (projectId: string, blockId: string, language: string, config: BlockConfig, content?: string): Promise<void> => {
    if (locale(language) !== true) {
      throw new Error(`Tried to write an block with invalid language tag "${language}"`);
    }
    const missingKeys = hasKeysOf(config, new BlockConfig());
    if (missingKeys !== true) {
      throw new Error(`Tried to write invalid block config. Missing required keys: ${missingKeys.join(', ')}`);
    }
    // Now write the file with header and given content
    const path = Path.join(pathTo.projects, projectId, 'blocks', `${blockId}.${language}.md`);
    await Fs.writeFile(path, `---
${JSON.stringify(config, null, 2)}
---
${content}`);
  }
};

/**
 * Returns all subdirectories of given directory
 */
export async function subdirectories(path: string): Promise<Fs.Dirent[]> {
  const dirent = await Fs.promises.readdir(path, { withFileTypes: true });
  return dirent.filter((dirent) => {
    return dirent.isDirectory();
  });
}

/**
 * Returns all files of given directory which can be filtered by extension
 */
export async function files(path: string, extension?: string): Promise<Fs.Dirent[]> {
  const dirent = await Fs.promises.readdir(path, { withFileTypes: true });
  return dirent.filter((dirent) => {
    if (extension && dirent.isFile() === true) {
      if (dirent.name.endsWith(extension)) {
        return true;
      }
      return false;
    }
    return dirent.isFile();
  });
}