import { ModelType } from '../../type/model';
import Project from './Project';

/**
 * The ElekIoCoreEvent is used to inform subscribers (inside and outside)
 * about events that take place inside the core
 * 
 * Does not extend the AbstractModel because the ID is not an UUID
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
  public readonly type: ModelType = ModelType.EVENT;

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