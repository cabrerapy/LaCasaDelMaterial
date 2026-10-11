import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoUserProvisioningAdapter } from './cognito-user-provisioning.js';

const sub = 'c2e086e2-47fd-4a56-90fd-3f9b772b0230';
test('Cognito inspection accepts only CONFIRMED and enable targets the configured pool', async () => {
  const commands: Record<string, unknown>[] = [];
  let status = 'FORCE_CHANGE_PASSWORD';
  const client = new CognitoIdentityProviderClient({ region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' } });
  client.middlewareStack.add(() => async args => {
    commands.push(args.input as Record<string, unknown>);
    return { response: {}, output: { $metadata: {}, Username: 'qa-id',
      UserStatus: status, UserAttributes: [{ Name: 'sub', Value: sub }, { Name: 'email', Value: 'qa@example.invalid' }] } };
  }, { step: 'initialize', name: 'offlineCapture' });
  const adapter = new CognitoUserProvisioningAdapter(client, 'us-east-1_offline');
  try {
    assert.deepEqual(await adapter.inspect('qa-id'), { sub, confirmed: false, email: 'qa@example.invalid', passwordChangeRequired: true });
    status = 'CONFIRMED';
    assert.deepEqual(await adapter.inspect('qa-id'), { sub, confirmed: true, email: 'qa@example.invalid', passwordChangeRequired: false });
    await adapter.enable('qa-id');
    await adapter.resendInvitation('qa-id');
    assert.equal(commands.length, 4);
    assert.equal(commands[3]?.['MessageAction'], 'RESEND');
    assert.deepEqual(commands[3]?.['DesiredDeliveryMediums'], ['EMAIL']);
    assert.equal(commands[3]?.['ForceAliasCreation'], false);
    for (const command of commands) {
      assert.equal(command['UserPoolId'], 'us-east-1_offline');
      assert.equal(command['Username'], 'qa-id');
      assert.equal(command['TemporaryPassword'], undefined);
    }
  } finally { client.destroy(); }
});
