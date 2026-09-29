import type { UserRole, UserStatus } from '@lcm/contracts';

export interface User {
  readonly id: string;
  readonly name: string;
  readonly username: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy?: string;
  readonly updatedBy?: string;
}
