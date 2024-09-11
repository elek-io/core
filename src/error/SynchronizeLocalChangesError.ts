export class SynchronizeLocalChangesError extends Error {
  constructor(projectId: string) {
    super(
      `Tried to delete Project "${projectId}" but it has local changes that are not yet pushed to the remote origin. Deleting a Project with local changes could lead to data loss. Use the "force" option to delete it anyway.`
    );

    this.name = 'SynchronizeLocalChangesError';
  }
}
