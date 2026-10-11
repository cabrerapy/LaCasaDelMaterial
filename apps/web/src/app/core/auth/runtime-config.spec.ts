import { beforeEach, expect, it, vi } from 'vitest';
import { loadRuntimeLogin } from './runtime-config';

const origin = 'https://app.example.invalid';
const config = { authMode: 'cognito', cognito: {
  domain: 'https://offline.auth.us-east-1.amazoncognito.com', clientId: 'offline',
  redirectUri: origin + '/auth/callback', logoutUri: origin + '/login'
} };
function fetchConfig(value: unknown) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(value)));
}
beforeEach(() => sessionStorage.clear());

it('keeps explicit local mode without auth headers or cached config', async () => {
  const fetcher = fetchConfig({ authMode: 'local' });
  expect(await loadRuntimeLogin(sessionStorage, origin, fetcher)).toBeNull();
  expect(fetcher.mock.calls[0]?.[0]).toBe('/runtime-config.json');
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', credentials: 'omit', redirect: 'error' });
  expect(fetcher.mock.calls[0]?.[1]?.headers).toBeUndefined();
});

it('creates Cognito login only from validated public config', async () => {
  const login = await loadRuntimeLogin(sessionStorage, origin, fetchConfig(config));
  expect(new URL(login!.logoutUrl()).searchParams.get('client_id')).toBe('offline');
});

it('fails closed for malformed config, secrets and foreign callbacks', async () => {
  for (const value of [null, [], {}, { authMode: 'unknown' }, { authMode: 'local', secret: 'forbidden' },
    { ...config, cognito: { ...config.cognito, clientSecret: 'forbidden' } },
    { ...config, cognito: { ...config.cognito, redirectUri: 'https://foreign.invalid/auth/callback' } },
    { ...config, cognito: { ...config.cognito, redirectUri: origin + '/wrong' } }]) {
    await expect(loadRuntimeLogin(sessionStorage, origin, fetchConfig(value))).rejects.toThrow();
  }
});

it('fails closed for missing file, unavailable network and SPA HTML fallback', async () => {
  for (const fetcher of [vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 })),
    vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>SPA</html>'))]) {
    await expect(loadRuntimeLogin(sessionStorage, origin, fetcher)).rejects.toThrow();
  }
});
