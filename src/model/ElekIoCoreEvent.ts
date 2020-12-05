import Project from './Project';

/**
 * 
 */
export default class ElekIoCoreEvent {
  /**
   * ID describing the event divided by colons
   * 
   * E.g.: "page:create"
   */
  public readonly id: string;

  /**
   * To make finding and parsing serialized events easier
   */
  public readonly type = 'event';

  /**
   * The project this event was triggered from
   */
  public readonly project: Project | null;

  /**
   * Additional object all subscribers have access to
   */
  public readonly data: Record<string, unknown> | null;

  constructor(id: string, optional?: {project?: Project, data?: Record<string, unknown>}) {
    this.id = id;
    this.project = optional?.project || null;
    this.data = optional?.data || null;
  }
}