import Fs from 'fs';
import * as Util from './util';
import Project from './project';

export const project = Project;

export const projects = {
  /**
   * Returns a list of all local projects
   */
  local: async (): Promise<Project[]> => {
    const projects: Promise<Project | Error>[] = [];
    // Get all ID's from the projects folder
    const dirent = await Fs.promises.readdir(Util.pathTo.projects, { withFileTypes: true });
    dirent.filter((dirent) => {
      return dirent.isDirectory();
    }).map(async (possibleProjectDirectory) => {
      // Here comes the trick:
      // By using "then" and "catch" we are able to create an array of Project and Error types
      // without throwing and stopping the later Promise.all() call prematurely
      projects.push(new Project().load(possibleProjectDirectory.name).then((project) => {
        return project;
      }).catch((error) => {
        console.log('Unable to load possible project: ' + error);
        // Because the error parameter could be anything, 
        // we need to specifically call an Error 
        return new Error(error);
      }));
    });

    // Resolve all promises
    // Here we do not expect any error to fail the call to Promise.all()
    // because we catched it earlier and returning an Error type instead of throwing it
    const resolvedProjects = await Promise.all(projects);

    // This way we can easily filter out any Error types
    // and are able to return only initialized projects 
    // that did not throw an error.
    // Note that we also need to use a User-Defined Type Guard here,
    // because otherwise TS does not recognize we are filtering the errors out
    //                                        >       |        <
    return resolvedProjects.filter((project): project is Project => {
      return project instanceof Error !== true;
    });
  },
  /**
   * Returns a list of all remote projects
   * @todo finish once elek.io API is available
   */
  remote: async (): Promise<Project[]> => {
    const projects: Project[] = [];
    return await Promise.all(projects);
  }
};