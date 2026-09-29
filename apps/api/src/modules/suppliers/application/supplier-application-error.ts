export class SupplierApplicationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message); this.name = 'SupplierApplicationError';
  }
}
