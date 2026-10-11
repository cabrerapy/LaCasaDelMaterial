import { CognitoPkce } from './cognito-pkce';

// Public configuration only. Never put credentials, passwords or secrets here.
export async function loadRuntimeLogin(storage: Storage, origin: string,
  fetcher: typeof fetch = globalThis.fetch): Promise<CognitoPkce | null> {
  const response = await fetcher('/runtime-config.json', {
    cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Runtime configuration unavailable');
  const value: unknown = await response.json();
  if (!record(value)) throw new Error('Invalid runtime configuration');
  if (value['authMode'] === 'local' && onlyKeys(value, ['authMode'])) return null;
  const config = value['cognito'];
  if (value['authMode'] !== 'cognito' || !onlyKeys(value, ['authMode', 'cognito']) || !record(config) ||
    !onlyKeys(config, ['domain', 'clientId', 'redirectUri', 'logoutUri'])) {
    throw new Error('Invalid runtime configuration');
  }
  const { domain, clientId, redirectUri, logoutUri } = config;
  if (typeof domain !== 'string' || typeof clientId !== 'string' ||
    typeof redirectUri !== 'string' || typeof logoutUri !== 'string' ||
    new URL(redirectUri).origin !== origin || new URL(logoutUri).origin !== origin ||
    new URL(redirectUri).pathname !== '/auth/callback') throw new Error('Invalid runtime configuration');
  return new CognitoPkce({ domain, clientId, redirectUri, logoutUri }, storage);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
