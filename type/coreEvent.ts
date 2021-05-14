export enum CoreEventName {
  ASSET_CREATE = 'asset:create',
  ASSET_READ = 'asset:read',
  ASSET_UPDATE = 'asset:update',
  ASSET_DELETE = 'asset:delete',

  BLOCK_CREATE = 'block:create',
  BLOCK_READ = 'block:read',
  BLOCK_UPDATE = 'block:update',
  BLOCK_DELETE = 'block:delete',

  ERROR = 'error',

  FILE_CREATE = 'file:create',
  FILE_READ = 'file:read',
  FILE_UPDATE = 'file:update',
  FILE_DELETE = 'file:delete',

  PAGE_CREATE = 'page:create',
  PAGE_READ = 'page:read',
  PAGE_UPDATE = 'page:update',
  PAGE_DELETE = 'page:delete',

  PROJECT_CREATE = 'project:create',
  PROJECT_READ = 'project:read',
  PROJECT_UPDATE = 'project:update',
  PROJECT_DELETE = 'project:delete',

  SNAPSHOT_CREATE = 'snapshot:create',
  SNAPSHOT_READ = 'snapshot:read',
  SNAPSHOT_LIST = 'snapshot:list',
  SNAPSHOT_REVERT = 'snapshot:revert',
  SNAPSHOT_DELETE = 'snapshot:delete',

  THEME_USE = 'theme:use',
  THEME_READ = 'theme:read',
  THEME_UPDATE = 'theme:update',
  THEME_DELETE = 'theme:delete',
}