export class RemoteOriginMissingError extends Error {
  constructor(projectId: string) {
    super(
      `Tried to delete Project "${projectId}" but it does not have a remote origin. Deleting a Project without a remote origin could lead to data loss. Use the "force" option to delete it anyway.`
    );

    this.name = 'RemoteOriginMissingError';
  }
}
