import type { UserRepository } from '../../users/domain/user.repository.js';
import type { ResolveCognitoUser } from './cognito-authentication.js';

export function createCognitoUserResolver(links: { findUserId(sub: string): Promise<string | null> }, users: UserRepository): ResolveCognitoUser {
  return async sub => {
    const userId = await links.findUserId(sub);
    if (!userId) return null;
    const user = await users.findById(userId);
    if (!user || user.id !== userId) return null;
    return { id: user.id, cognitoSub: sub, role: user.role, status: user.status };
  };
}
