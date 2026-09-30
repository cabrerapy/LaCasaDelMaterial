export class PurchaseApplicationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message); this.name = 'PurchaseApplicationError';
  }
}
