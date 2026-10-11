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

test('configured hosted UI uses code grant and exact supplied callback/logout, no implicit grant', () => {
  const stack = new Stack(new App(), 'IdentityOAuthTest');
  new ApplicationIdentity(stack, 'Identity', {
    domainPrefix: 'offline-lcm-identity-test',
    callbackUrl: 'https://app.example.invalid/auth/callback', logoutUrl: 'https://app.example.invalid/login'
  });
  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
    AllowedOAuthFlows: ['code'], AllowedOAuthFlowsUserPoolClient: true,
    CallbackURLs: ['https://app.example.invalid/auth/callback'], LogoutURLs: ['https://app.example.invalid/login']
  });
  template.hasResourceProperties('AWS::Cognito::UserPoolDomain', { Domain: 'offline-lcm-identity-test', ManagedLoginVersion: 1 });
  const outputs = template.toJSON().Outputs;
  assert.equal(Object.keys(outputs).length, 1);
  assert.ok(JSON.stringify(outputs).includes('authMode'));
  assert.ok(JSON.stringify(outputs).includes('cognito'));
  assert.ok(!JSON.stringify(outputs).includes('clientSecret'));
});

test('identity rejects insecure callback before creating resources', () => {
  const stack = new Stack(new App(), 'IdentityInvalidTest');
  assert.throws(() => new ApplicationIdentity(stack, 'Identity', {
    domainPrefix: 'offline-test', callbackUrl: 'http://wrong.invalid/auth/callback', logoutUrl: 'https://app.example.invalid/login'
  }), /HTTPS/);
});
