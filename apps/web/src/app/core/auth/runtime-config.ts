import { CognitoPkce } from './cognito-pkce';

// Public configuration only. Never put credentials, passwords or secrets here.
export async function loadRuntimeLogin(storage: Storage, origin: string,
  fetcher: typeof fetch = globalThis.fetch): Promise<CognitoPkce | null> {
  return (await loadRuntimeAuth(storage, origin, fetcher)).login;
}

export async function loadRuntimeAuth(storage: Storage, origin: string,
  fetcher: typeof fetch = globalThis.fetch): Promise<{ login: CognitoPkce | null; enrollment: CognitoPkce | null }> {
  const response = await fetcher('/runtime-config.json', {
    cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Runtime configuration unavailable');
  const value: unknown = await response.json();
  if (!record(value)) throw new Error('Invalid runtime configuration');
  if (value['authMode'] === 'local' && onlyKeys(value, ['authMode'])) return { login: null, enrollment: null };
  const config = value['cognito'];
  const expectedKeys = Object.hasOwn(value, 'cognitoEnrollment') ? ['authMode', 'cognito', 'cognitoEnrollment'] : ['authMode', 'cognito'];
  if (value['authMode'] !== 'cognito' || !onlyKeys(value, expectedKeys) || !record(config) ||
    !onlyKeys(config, ['domain', 'clientId', 'redirectUri', 'logoutUri'])) {
    throw new Error('Invalid runtime configuration');
  }
  const { domain, clientId, redirectUri, logoutUri } = config;
  if (typeof domain !== 'string' || typeof clientId !== 'string' ||
    typeof redirectUri !== 'string' || typeof logoutUri !== 'string' ||
    new URL(redirectUri).origin !== origin || new URL(logoutUri).origin !== origin ||
    new URL(redirectUri).pathname !== '/auth/callback') throw new Error('Invalid runtime configuration');
  const login = new CognitoPkce({ domain, clientId, redirectUri, logoutUri }, storage);
  if (!Object.hasOwn(value, 'cognitoEnrollment')) return { login, enrollment: null };
  const extra = value['cognitoEnrollment'];
  if (!record(extra) || !onlyKeys(extra, ['domain', 'clientId', 'redirectUri', 'logoutUri']) ||
    extra['domain'] !== domain || extra['logoutUri'] !== logoutUri ||
    typeof extra['clientId'] !== 'string' || extra['clientId'].trim() === clientId.trim() ||
    typeof extra['redirectUri'] !== 'string' || extra['redirectUri'] !== origin + '/auth/enrollment/callback') {
    throw new Error('Invalid enrollment configuration');
  }
  return { login, enrollment: new CognitoPkce({ domain, clientId: extra['clientId'],
    redirectUri: extra['redirectUri'], logoutUri }, storage, globalThis.crypto, 'enrollment') };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
