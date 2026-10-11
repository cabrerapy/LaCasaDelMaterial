export interface CognitoBrowserConfig {
  readonly domain: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly logoutUri: string;
}
interface PendingLogin { readonly state: string; readonly verifier: string; readonly startedAt: number; }
const KEY = 'lcm.cognito.pending';

// No client secret, password, refresh token or AWS credentials enter this helper.
export class CognitoPkce {
  private readonly domain: URL;
  private readonly callback: URL;
  constructor(private readonly config: CognitoBrowserConfig, private readonly storage: Storage,
    private readonly cryptoApi: Crypto = globalThis.crypto) {
    this.domain = new URL(config.domain);
    this.callback = new URL(config.redirectUri);
    const logout = new URL(config.logoutUri);
    if (this.domain.protocol !== 'https:' || this.domain.username || this.domain.password ||
      this.domain.pathname !== '/' || this.domain.search || this.domain.hash ||
      this.callback.protocol !== 'https:' || this.callback.username || this.callback.password ||
      this.callback.search || this.callback.hash || !config.clientId.trim() ||
      logout.protocol !== 'https:' || logout.username || logout.password || logout.search || logout.hash ||
      logout.origin !== this.callback.origin) {
      throw new Error('Invalid Cognito browser configuration');
    }
  }

  async begin(): Promise<string> {
    const verifier = this.random();
    const state = this.random();
    const challenge = base64url(new Uint8Array(await this.cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const pending: PendingLogin = { state, verifier, startedAt: Date.now() };
    this.storage.setItem(KEY, JSON.stringify(pending));
    const url = new URL('/oauth2/authorize', this.domain);
    url.search = new URLSearchParams({ response_type: 'code', client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri, scope: 'openid email profile', state,
      code_challenge_method: 'S256', code_challenge: challenge }).toString();
    return url.href;
  }

  async complete(callbackUrl: string, fetcher: typeof fetch = globalThis.fetch): Promise<string> {
    const raw = this.storage.getItem(KEY);
    this.storage.removeItem(KEY); // one-use, including errors and invalid callbacks
    const url = new URL(callbackUrl);
    if (!raw || url.origin !== this.callback.origin || url.pathname !== this.callback.pathname || url.hash ||
      url.searchParams.has('error') || url.searchParams.getAll('state').length !== 1 || url.searchParams.getAll('code').length !== 1) {
      throw new Error('Invalid login callback');
    }
    const pending: unknown = JSON.parse(raw);
    if (!isPending(pending) || Date.now() - pending.startedAt > 600000 || pending.startedAt > Date.now() ||
      url.searchParams.get('state') !== pending.state || !url.searchParams.get('code')) throw new Error('Invalid login state');
    const response = await fetcher(new URL('/oauth2/token', this.domain), {
      method: 'POST', credentials: 'omit', redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri, code: url.searchParams.get('code')!, code_verifier: pending.verifier })
    });
    if (!response.ok) throw new Error('Cognito login failed');
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('access_token' in payload) ||
      typeof payload.access_token !== 'string' || !payload.access_token ||
      !('token_type' in payload) || payload.token_type !== 'Bearer') throw new Error('Invalid Cognito response');
    return payload.access_token; // backend /me must validate it before starting a session
  }

  logoutUrl(): string {
    this.cancel();
    const url = new URL('/logout', this.domain);
    url.search = new URLSearchParams({ client_id: this.config.clientId, logout_uri: this.config.logoutUri }).toString();
    return url.href;
  }

  cancel(): void { this.storage.removeItem(KEY); }
  private random(): string { return base64url(this.cryptoApi.getRandomValues(new Uint8Array(32))); }
}
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function isPending(value: unknown): value is PendingLogin {
  if (!value || typeof value !== 'object') return false;
  return 'state' in value && typeof value.state === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.state) &&
    'verifier' in value && typeof value.verifier === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.verifier) &&
    'startedAt' in value && typeof value.startedAt === 'number' && Number.isFinite(value.startedAt);
}
