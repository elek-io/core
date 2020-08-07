export default class ClassReinitializedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClassReinitializedError';
  }
}