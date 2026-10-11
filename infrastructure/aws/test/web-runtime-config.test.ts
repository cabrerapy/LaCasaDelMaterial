import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runtimeConfigFromOutputs } from '../lib/web-runtime-config.js';
const config = { authMode: 'cognito', cognito: {
  domain: 'https://offline.auth.us-east-1.amazoncognito.com', clientId: 'offline',
  redirectUri: 'https://app.example.invalid/auth/callback', logoutUri: 'https://app.example.invalid/login'
} };
test('extracts only public config from selected CDK output', () => {
  const result = runtimeConfigFromOutputs({ Stack: { Config: JSON.stringify(config), Secret: 'never-printed' } }, 'Stack', 'Config');
  assert.deepEqual(JSON.parse(result), config);
  assert.ok(!result.includes('never-printed'));
});
test('rejects missing outputs, local fallback, secrets and unsafe URLs', () => {
  assert.throws(() => runtimeConfigFromOutputs({}, 'Stack', 'Config'));
  for (const invalid of [{ authMode: 'local' }, { ...config, secret: 'forbidden' },
    { ...config, cognito: { ...config.cognito, clientSecret: 'forbidden' } },
    { ...config, cognito: { ...config.cognito, logoutUri: 'https://foreign.invalid/login' } },
    { ...config, cognito: { ...config.cognito, domain: 'http://wrong.invalid' } }]) {
    assert.throws(() => runtimeConfigFromOutputs({ Stack: { Config: JSON.stringify(invalid) } }, 'Stack', 'Config'));
  }
});
