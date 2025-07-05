# @elek-io/core

## 0.14.2

### Patch Changes

- b0df691: Upgraded dependencies
- db8f71b: Git pull now tries to rebase first to reduce merge commits

## 0.14.1

### Patch Changes

- b28ba2d: Updated GitHub action runner

## 0.14.0

### Minor Changes

- 62bb27e: Made all API methods async to return Promisses for easier use in IPC. Git signature type now expects the email to actually be one instead of any string. Removed window object inside the Users config file.

## 0.13.0

### Minor Changes

- 1b1c0ce: Added local API endpoints for Projects, Assets, Collections and Entries. Also added custom logger middleware that uses our LogService.
  Removed the ability to directly resolve Entry reference Values - this needs to now be handled Client-side.

## 0.12.0

### Minor Changes

- 6e283f3: Added first local API routes to test inside elek.io Client

## 0.11.1

### Patch Changes

- 609cd30: fix: reading multiple Assets with the same ID but different commit hashes from history, do not overwrite each other anymore

## 0.11.0

### Minor Changes

- 9b3afaa: Git messages are now stringified JSON containing more information about the operation like the object type and ID.
  Git commits now contain the tag objects directly, instead of just the reference.
  Projects now have a "production" and a "work" branch.
  Returned Projects now contain remoteOriginUrl without the need of calling this method separately.
  Projects now have a protection against deletion if there is no remote yet or the local Project has changes not present on the remote yet.
  If Projets have to be deleted anyway, there now is a "force" option to do so.
  Changed Project upgrade to work with an additional upgrade branch and then squash merge it back into work branch.
  Removed old file based upgrade.
  Added git merge and branch delete method.
  Added support for most file types to be used as Assets.
  Added more tests and converted clone related tests from using a remote Github repository to a local one.
  Removed return for logging methods and added timestamp to CLI output.

## 0.10.0

### Minor Changes

- cc6a1a4: Removed unused options and added file cache option
- 2b3f3b5: Added history key to all objects (Project, Asset, Collection and Entry) and the `read` method of their services now support reading from history by providing a commit hash. Also added `save` method for Assets to let the user copy given file somewhere to his filesystem. This also works for Assets from history.
- 9b79cac: Changed the way the `upgrade` method for Projects work by migrating objects on disk directly. Reading from history also applies this migration step to comply with the current schema.

### Patch Changes

- 938c0a1: Added logging
- 17dbf20: Added matrix testing on all supported platforms and fixed EOL and path seperation issues with git commands in windows.
- 2605542: Removed usage of LFS and improved git command logging

## 0.9.1

### Patch Changes

- fa234b7: Removed displayId from user file

## 0.9.0

### Minor Changes

- a2a7b7a: Assets do not have a language anymore
- 5dec07b: The Users window position and size is saved between application launches

## 0.8.0

### Minor Changes

- a8db4a5: Value input types are now called Field types. Value definitions are now called Field definitions

## 0.7.0

### Minor Changes

- d5fc359: Switched to a different slug generating dependency and updated all dependencies
- 27e16e9: Using datetime instead of timestamp for created and updated fields as well as git log and git tags --list results

### Patch Changes

- 13b4626: Fixed import for browser environments and added ElekIoCore type export to it

## 0.6.0

### Minor Changes

- dd365e3: Now only exports ESM - electron and the browser should now be able to handle it and it resolves issues with dependencies while exporting CJS

## 0.5.4

### Patch Changes

- daf5f50: fix: EXPORT_TYPES_INVALID_FORMAT

## 0.5.3

### Patch Changes

- 03dd60a: Removed unused code

## 0.5.2

### Patch Changes

- 8114ca1: fix: properly export for node and browser environments

## 0.5.1

### Patch Changes

- 45d5de4: Optimized imports

## 0.5.0

### Minor Changes

- a923ef7: Separated entry points for node and browser. Simplified imports by providing exports via index.ts for errors and services

## 0.4.2

### Patch Changes

- b56c625: Added missing export of shared functions

## 0.4.1

### Patch Changes

- a0293cd: Added missing export of schema files

## 0.4.0

### Minor Changes

- 7c56031: Added git methods for working with branches, remotes, pull, fetch and push. The ProjectService can now determine changes between the local Project and it's remote origin and synchonize (pull & push) between them.
- 71efc35: Removed search, filter and sort
- 7c56031: Updated shared lib to 0.6.2 - moving from optional keys that could be undefined to nullable values and changing the structure of Entry Value references and their resolved counterparts

## 0.3.1

### Patch Changes

- a2be0a5: Updated shared lib to 5.0.1

## 0.3.0

### Minor Changes

- e691b5d: Updated shared lib to 0.5.0. Added Entry references and removed sharedValues for now.

## 0.2.1

### Patch Changes

- b0bd8c1: Updated shared lib to 0.4.7

## 0.2.0

### Minor Changes

- c517e48: Entries now have Values directly attached which is the default now. Additionally it's possible to use shared Values between n Entries, which are referenced by ID and language inside the Entry. Also Entries resolve shared Values now automatically
- 7a93e5c: Entries now have direct Values and referenced Values (Assets and shared Values) that are resolved when the Entry is requested

## 0.1.1

### Patch Changes

- db49cc6: Environment is now based on passed param instead of NODE_ENV
