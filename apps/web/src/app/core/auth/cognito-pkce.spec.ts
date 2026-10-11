import { webcrypto, createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { CognitoPkce } from './cognito-pkce';
const config = { domain: 'https://offline.auth.us-east-1.amazoncognito.com', clientId: 'offline-client', redirectUri: 'https://app.example.invalid/auth/callback', logoutUri: 'https://app.example.invalid/login' };
beforeEach(() => sessionStorage.clear());
function client() { return new CognitoPkce(config, sessionStorage, webcrypto as unknown as Crypto); }

it('uses random state and S256 PKCE without exposing verifier in authorization URL', async () => {
  const pkce = client();
  const url = new URL(await pkce.begin());
  const pending = JSON.parse(sessionStorage.getItem('lcm.cognito.pending')!);
  expect(url.searchParams.get('response_type')).toBe('code');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(pending.verifier).digest('base64url'));
  expect(url.searchParams.has('code_verifier')).toBe(false);
  expect(new URL(await pkce.begin()).searchParams.get('state')).not.toBe(url.searchParams.get('state'));
});

it('exchanges code once without secret, credentials or authorization header', async () => {
  const pkce = client();
  const state = new URL(await pkce.begin()).searchParams.get('state');
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ access_token: 'access', token_type: 'Bearer', refresh_token: 'not-stored' })));
  const callback = `${config.redirectUri}?code=offline-code&state=${state}`;
  expect(await pkce.complete(callback, fetcher)).toBe('access');
  const options = fetcher.mock.calls[0]?.[1];
  expect(options?.credentials).toBe('omit');
  expect(options?.redirect).toBe('error');
  expect(String(options?.body)).not.toContain('client_secret');
  expect(sessionStorage.getItem('lcm.cognito.pending')).toBeNull();
  await expect(pkce.complete(callback, fetcher)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('rejects mismatched state, callback origin and expired transactions before network access', async () => {
  for (const scenario of ['state', 'origin', 'expired']) {
    const pkce = client();
    const state = new URL(await pkce.begin()).searchParams.get('state');
    if (scenario === 'expired') {
      const pending = JSON.parse(sessionStorage.getItem('lcm.cognito.pending')!);
      pending.startedAt = Date.now() - 600001;
      sessionStorage.setItem('lcm.cognito.pending', JSON.stringify(pending));
    }
    const fetcher = vi.fn<typeof fetch>();
    const callback = `${scenario === 'origin' ? 'https://wrong.invalid/auth/callback' : config.redirectUri}?code=code&state=${scenario === 'state' ? 'wrong' : state}`;
    await expect(pkce.complete(callback, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  }
});

it('requires HTTPS configuration and callback without query or fragment', () => {
  for (const invalid of [{ ...config, domain: 'http://wrong.invalid' }, { ...config, redirectUri: config.redirectUri + '#fragment' }]) {
    expect(() => new CognitoPkce(invalid, sessionStorage)).toThrow();
  }
});

it('builds Hosted UI logout without tokens and cancels pending login', async () => {
  const pkce = client();
  await pkce.begin();
  const url = new URL(pkce.logoutUrl());
  expect(url.origin).toBe(new URL(config.domain).origin);
  expect(url.pathname).toBe('/logout');
  expect([...url.searchParams.entries()]).toEqual([
    ['client_id', config.clientId], ['logout_uri', config.logoutUri]
  ]);
  expect(sessionStorage.getItem('lcm.cognito.pending')).toBeNull();
});

it('rejects unsafe or cross-origin logout destinations', () => {
  for (const logoutUri of ['http://app.example.invalid/login', 'https://other.invalid/login',
    config.logoutUri + '?token=x', config.logoutUri + '#fragment', 'https://user:pass@app.example.invalid/login']) {
    expect(() => new CognitoPkce({ ...config, logoutUri }, sessionStorage)).toThrow();
  }
});
