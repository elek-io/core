import { ElekIoCoreOptions } from '../../type/general';
import { ServiceType } from '../../type/service';
import GenericLogger from '../logger/GenericLogger';
import ProjectLogger from '../logger/ProjectLogger';
import AbstractService from './AbstractService';
import EventService from './EventService';

/**
 * Service for writing logs to disk.
 * Provides a generic logger and one specific logger for every project
 * 
 * @todo Check why the genericLogger does not actually log anything to it's file
 */
export default class LogService extends AbstractService {
  private readonly eventService: EventService;
  private readonly genericLogger: GenericLogger;
  private readonly projectLoggers: ProjectLogger[] = [];

  constructor(options: ElekIoCoreOptions, eventService: EventService) {
    super(ServiceType.LOG, options);

    this.eventService = eventService;
    this.genericLogger = new GenericLogger(this.options.log.fileName, this.eventService);
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
    const newProjectLogger = new ProjectLogger(projectId, this.options.log.fileName, this.eventService);
    this.projectLoggers.push(newProjectLogger);
    return newProjectLogger;
  }
}
