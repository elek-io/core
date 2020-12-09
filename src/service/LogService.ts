import { ElekIoCoreOptions } from '../../type/general';
import GenericLogger from '../logger/GenericLogger';
import ProjectLogger from '../logger/projectLogger';
import AbstractService from './AbstractService';

/**
 * Service for writing logs to disk.
 * Provides a generic logger and one specific logger for every project
 */
export default class LogService extends AbstractService {
  private readonly genericLogger: GenericLogger;
  private readonly projectLoggers: ProjectLogger[] = [];

  /**
   * Creates a new instance of the LogService which
   * inherits the type and options properties from AbstractService
   * 
   * @param options ElekIoCoreOptions
   */
  constructor(options: ElekIoCoreOptions) {
    super('log', options);

    this.genericLogger = new GenericLogger();
  }

  /**
   * Logger for logs that are not specific to a project
   */
  public get generic(): GenericLogger {
    return this.genericLogger;
  }

  /**
   * Logger for logs that are specific to a project
   * 
   * @param projectId ID of the project to log to
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
