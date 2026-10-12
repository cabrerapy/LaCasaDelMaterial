import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoTotpEnrollment } from './cognito-totp-enrollment.js';
test('SDK enrollment uses only the current access token, enables TOTP and never SMS', async () => {
  const commands: Record<string, unknown>[] = [];
  const outputs = [{ UserMFASettingList: [] }, { SecretCode: 'ABCDEFGHIJKLMNOP' }, { Status: 'SUCCESS' }, {}];
  const client = new CognitoIdentityProviderClient({ region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' } });
  client.middlewareStack.add(() => async args => {
    commands.push(args.input as Record<string, unknown>);
    return { response: {}, output: { $metadata: {}, ...outputs.shift() } };
  }, { step: 'initialize', name: 'offlineEnrollment' });
  try {
    const gateway = new CognitoTotpEnrollment(client);
    assert.equal(await gateway.enabled('offline-token'), false);
    assert.equal(await gateway.associate('offline-token'), 'ABCDEFGHIJKLMNOP');
    assert.equal(await gateway.verifyCode('offline-token', '123456'), true);
    await gateway.prefer('offline-token');
    assert.equal(commands.length, 4);
    for (const command of commands) {
      assert.equal(command['AccessToken'], 'offline-token');
      assert.equal(command['UserPoolId'], undefined);
      assert.equal(command['Username'], undefined);
      assert.equal(command['SMSMfaSettings'], undefined);
    }
    assert.deepEqual(commands[3]?.['SoftwareTokenMfaSettings'], { Enabled: true, PreferredMfa: true });
  } finally { client.destroy(); }
});
