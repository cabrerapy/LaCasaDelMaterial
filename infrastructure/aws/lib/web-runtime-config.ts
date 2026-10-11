// Extract only the public Cognito output; never print unrelated stack outputs.
export function runtimeConfigFromOutputs(input: unknown, stackName: string, outputKey: string): string {
  if (!record(input) || !Object.hasOwn(input, stackName)) throw new Error('Stack output missing');
  const outputs = input[stackName];
  if (!record(outputs) || !Object.hasOwn(outputs, outputKey) || typeof outputs[outputKey] !== 'string') {
    throw new Error('Runtime configuration output missing');
  }
  const value: unknown = JSON.parse(outputs[outputKey]);
  if (!record(value) || !keys(value, ['authMode', 'cognito']) || value['authMode'] !== 'cognito') throw new Error('Invalid auth mode');
  const config = value['cognito'];
  if (!record(config) || !keys(config, ['domain', 'clientId', 'redirectUri', 'logoutUri'])) throw new Error('Invalid public config');
  const { domain, clientId, redirectUri, logoutUri } = config;
  if (typeof domain !== 'string' || typeof clientId !== 'string' || !clientId.trim() ||
    typeof redirectUri !== 'string' || typeof logoutUri !== 'string') throw new Error('Invalid public config');
  const urls = [domain, redirectUri, logoutUri].map(value => new URL(value));
  if (urls.some(url => url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) ||
    urls[0]!.pathname !== '/' || urls[1]!.pathname !== '/auth/callback' || urls[1]!.origin !== urls[2]!.origin) {
    throw new Error('Invalid public URLs');
  }
  return JSON.stringify(value, null, 2) + '\n';
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}
