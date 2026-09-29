import type { User } from '../domain/user.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { UserPage } from '../domain/user.repository.js';

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const normalized = username.toLowerCase();
    return [...this.users.values()].find((user) => user.username === normalized) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase();
    return [...this.users.values()].find((user) => user.email === normalized) ?? null;
  }

  async create(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  async update(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  async list(limit: number, nextToken?: string): Promise<UserPage> {
    const items = [...this.users.values()].sort((left, right) =>
      left.username.localeCompare(right.username)
    );
    const start = nextToken ? Number(nextToken) : 0;
    const page = items.slice(start, start + limit);
    const followingIndex = start + page.length;
    return {
      items: page,
      ...(followingIndex < items.length ? { nextToken: String(followingIndex) } : {})
    };
  }

  async countActiveAdmins(): Promise<number> {
    return [...this.users.values()].filter(
      (user) => user.role === 'ADMIN' && user.status === 'ACTIVE'
    ).length;
  }
}
