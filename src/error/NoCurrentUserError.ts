export class NoCurrentUserError extends Error {
  constructor() {
    super('Make sure to set a User via Core before using other methods');

    this.name = 'NoCurrentUserError';
  }
}
