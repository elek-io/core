import Fs from 'fs-extra';
import Path from 'node:path';
import { pathTo } from '../util/node.js';

/**
 * Runs once before the entire test suite.
 * Cleans up leftover projects and generated clients from previous test runs
 * that may have failed before their cleanup code could execute.
 */
export default async function globalSetup() {
  await Fs.emptyDir(pathTo.projects);
  await Fs.emptyDir(Path.resolve('.elek.io'));
}
