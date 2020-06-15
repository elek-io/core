import Fs from 'fs';
import * as Util from './util';
import Project from './project';

export const project = Project;

export async function projects(): Promise<Project[]> {
  const projects: Promise<Project>[] = [];
  // Get all ID's from the projects folder
  const dirent = await Fs.promises.readdir(Util.pathTo.projects, { withFileTypes: true });
  dirent.filter((dirent) => {
    return dirent.isDirectory();
  }).map((possibleProjectDirectory) => {
    // Try loading each project
    try {
      projects.push(new Project().load(possibleProjectDirectory.name));
    } catch (error) {
      console.log(`Unable to load possible project "${possibleProjectDirectory.name}": ` + error);
    }
  });
  return await Promise.all(projects);
}