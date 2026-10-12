// Enrollment tokens must never be accepted by the commercial verifier.
export function enrollmentClientId(environment: NodeJS.ProcessEnv, commercialClientId: string): string | null {
  const flag = environment['LCM_COGNITO_ENROLLMENT_ENABLED'];
  if (flag !== undefined && flag !== 'yes' && flag !== 'no') throw new Error('Invalid enrollment flag');
  if (flag !== 'yes') return null;
  const clientId = environment['COGNITO_ENROLLMENT_CLIENT_ID']?.trim();
  if (!clientId || !/^[a-zA-Z0-9]{1,128}$/.test(clientId) || clientId === commercialClientId.trim()) {
    throw new Error('Enrollment requires a distinct Cognito client');
  }
  return clientId;
}
