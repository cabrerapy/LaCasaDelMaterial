import type { User } from './user.js';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(user: User): Promise<void>;
  update(user: User): Promise<void>;
  list(limit: number, nextToken?: string): Promise<UserPage>;
  countActiveAdmins(): Promise<number>;
}

export interface UserPage {
  readonly items: readonly User[];
  readonly nextToken?: string;
}
