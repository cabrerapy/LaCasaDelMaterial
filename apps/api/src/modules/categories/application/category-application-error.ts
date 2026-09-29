export class CategoryApplicationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'CategoryApplicationError';
  }
}
