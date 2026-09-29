export class AuthenticationError extends Error {
  constructor() {
    super('Credenciales inválidas');
    this.name = 'AuthenticationError';
  }
}
