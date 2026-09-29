export class ProductApplicationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'ProductApplicationError';
  }
}
