/**
 * Every status a page can have
 * 
 * Progressing through it is mostly linear
 */
export enum PageStatusEnum {
  /**
   * Only visible to the author(s) himself / themselfes
   * 
   * Cannot be deployed
   */
  'private',
  /**
   * Work in progress
   * 
   * Visible to all editors but cannot be deployed
   */
  'wip',
  /**
   * Done but awaiting someone to review and approve 
   * or comment and set it back to wip
   * 
   * Highlighted to anyone who can approve but cannot be deployed
   */
  'pending',
  /**
   * Done and approved for publishing
   * 
   * Can be published manually or scheduled
   */
  'approved',
  /**
   * Scheduled to be published on a specific date and time
   * 
   * Only available via elek.io cloud
   */
  'scheduled',
  /**
   * Already available to the public
   * 
   * If edited, will be set back to wip
   * @todo check how this affects the published HTML site,
   * as we do not want to delete it. Maybe a new "revision" service would make sense
   */
  'published'
}

export type PageStatus = keyof typeof PageStatusEnum;

/**
 * Reference of a pages content which can be resolved via provided IDs
 */
export interface PageContentReference {
  positionId: string;
  blockId: string;
}