import argon2 from 'argon2';
import type { PasswordHasher } from '../application/password-hasher.js';

export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return argon2.verify(passwordHash, password);
  }
}
