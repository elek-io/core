export default class ClassNotInitializedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClassNotInitializedError';
  }
}