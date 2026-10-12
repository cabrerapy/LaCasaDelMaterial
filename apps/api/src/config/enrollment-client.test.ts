import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enrollmentClientId } from './enrollment-client.js';

test('enrollment remains disabled by default and ignores unused client configuration', () => {
  assert.equal(enrollmentClientId({}, 'business'), null);
  assert.equal(enrollmentClientId({ LCM_COGNITO_ENROLLMENT_ENABLED: 'no' }, 'business'), null);
});
test('enabled enrollment fails closed without a separate valid client', () => {
  for (const client of [undefined, '', 'business', ' business ', 'invalid/client']) {
    assert.throws(() => enrollmentClientId({ LCM_COGNITO_ENROLLMENT_ENABLED: 'yes',
      COGNITO_ENROLLMENT_CLIENT_ID: client }, 'business'));
  }
  assert.throws(() => enrollmentClientId({ LCM_COGNITO_ENROLLMENT_ENABLED: 'true' }, 'business'));
});
test('enabled enrollment selects only the dedicated client', () => {
  assert.equal(enrollmentClientId({ LCM_COGNITO_ENROLLMENT_ENABLED: 'yes',
    COGNITO_ENROLLMENT_CLIENT_ID: ' onboarding123 ' }, 'business'), 'onboarding123');
});
