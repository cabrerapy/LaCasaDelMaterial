export class UserApplicationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = 'UserApplicationError';
  }
}
