import GlobalLogger from '../logger/globalLogger';
import ProjectLogger from '../logger/projectLogger';
import AbstractService from './AbstractService';

/**
 * Service for writing logs
 */
export default class LogService extends AbstractService {
  private globalLogger: GlobalLogger;
  private projectLoggers: ProjectLogger[] = [];

  constructor() {
    super('log');

    this.globalLogger = new GlobalLogger();
  }

  /**
   * Logger for logs that are not specific to a project
   */
  public get global(): GlobalLogger {
    return this.globalLogger;
  }

  /**
   * Logger for logs that are specific to a project
   */
  public project(projectId: string): ProjectLogger {
    // Singleton implementation
    // Tries to find an existing logger for this project first
    const existingProjectLogger = this.projectLoggers.find((projectLogger) => {
      return projectLogger.projectId === projectId;
    });
    if (existingProjectLogger) {
      return existingProjectLogger;
    }
    // And creates a new logger for this project if it's not available already
    const newProjectLogger = new ProjectLogger(projectId);
    this.projectLoggers.push(newProjectLogger);
    return newProjectLogger;
  }
}