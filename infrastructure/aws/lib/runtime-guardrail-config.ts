export function runtimeGuardrailConfig(account: string, roleName: unknown, boundaryArn: unknown) {
  if (!/^\d{12}$/.test(account) || typeof roleName !== 'string' ||
    !/^lcm-production-[a-z0-9-]{1,40}$/.test(roleName) || typeof boundaryArn !== 'string' ||
    !new RegExp(`^arn:aws:iam::${account}:policy/lcm-production-[a-z0-9-]{1,40}$`).test(boundaryArn)) {
    throw new Error('Explicit same-account runtimeRoleName and runtimeBoundaryArn required');
  }
  return { roleName, boundaryArn };
}
