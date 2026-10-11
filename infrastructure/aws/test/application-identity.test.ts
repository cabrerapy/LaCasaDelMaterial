import { test } from 'node:test';
import assert from 'node:assert/strict';
import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ApplicationIdentity } from '../lib/application-identity.js';

test('candidate identity is private-registration Lite, retained, without SMS or browser secret', () => {
  const stack = new Stack(new App(), 'IdentityTest');
  new ApplicationIdentity(stack, 'Identity');
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::Cognito::UserPool', {
    UserPoolTier: 'LITE', DeletionProtection: 'ACTIVE',
    AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
    AccountRecoverySetting: { RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }] },
    Policies: Match.objectLike({ PasswordPolicy: Match.objectLike({ MinimumLength: 12, TemporaryPasswordValidityDays: 3 }) })
  });
  template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
    GenerateSecret: false, EnableTokenRevocation: true,
    PreventUserExistenceErrors: 'ENABLED',
    ExplicitAuthFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']
  });
  for (const pool of Object.values(template.findResources('AWS::Cognito::UserPool'))) {
    assert.equal(pool.DeletionPolicy, 'Retain');
    assert.equal(pool.Properties.SmsConfiguration, undefined);
  }
  template.resourceCountIs('AWS::IAM::Role', 0);
});
