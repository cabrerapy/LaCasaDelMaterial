import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RequireCognitoAdminMfa } from './require-cognito-admin-mfa.js';
const userId = 'a2e086e2-47fd-4a56-90fd-3f9b772b0230';
const sub = 'b2e086e2-47fd-4a56-90fd-3f9b772b0230';
test('administrator MFA configuration must be confirmed, enabled, TOTP and linked', async () => {
  const valid = { sub, confirmed: true, enabled: true, totpEnabled: true };
  for (const identity of [{ ...valid, confirmed: false }, { ...valid, enabled: false }, { ...valid, totpEnabled: false }]) {
    const gate = new RequireCognitoAdminMfa({ inspect: async () => identity }, { findUserId: async () => userId });
    await assert.rejects(gate.execute(userId), /TOTP/);
  }
  await assert.rejects(new RequireCognitoAdminMfa({ inspect: async () => valid }, { findUserId: async () => null }).execute(userId), /TOTP/);
  await new RequireCognitoAdminMfa({ inspect: async () => valid }, { findUserId: async () => userId }).execute(userId);
});
test('MFA lookup failure cannot bypass the gate', async () => {
  const gate = new RequireCognitoAdminMfa({ inspect: async () => { throw new Error('lookup timeout'); } }, { findUserId: async () => userId });
  await assert.rejects(gate.execute(userId), /lookup timeout/);
});
