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

test('enrollment has a separate short-lived public client and self-service scope only', () => {
  const stack = new Stack(new App(), 'EnrollmentTest');
  const identity = new ApplicationIdentity(stack, 'Identity', {
    domainPrefix: 'offline-enrollment', callbackUrl: 'https://app.example.invalid/auth/callback',
    logoutUrl: 'https://app.example.invalid/login', enrollmentCallbackUrl: 'https://app.example.invalid/auth/enrollment/callback'
  });
  assert.notEqual(identity.enrollmentClient?.userPoolClientId, identity.webClient.userPoolClientId);
  const template = Template.fromStack(stack);
  template.resourceCountIs('AWS::Cognito::UserPoolClient', 2);
  assert.ok(JSON.stringify(template.toJSON().Outputs).includes('cognitoEnrollment'));
  assert.ok(!JSON.stringify(template.toJSON().Outputs).includes('clientSecret'));
  template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
    GenerateSecret: false, AllowedOAuthFlows: ['code'], AllowedOAuthScopes: ['aws.cognito.signin.user.admin'],
    CallbackURLs: ['https://app.example.invalid/auth/enrollment/callback'],
    AccessTokenValidity: 10, IdTokenValidity: 10, ReadAttributes: ['email', 'name'], WriteAttributes: ['email', 'name']
  });
});

test('enrollment rejects foreign origin or commercial callback', () => {
  for (const callback of ['https://foreign.invalid/auth/enrollment/callback', 'https://app.example.invalid/auth/callback']) {
    assert.throws(() => new ApplicationIdentity(new Stack(new App(), 'InvalidEnrollment'), 'Identity', {
      domainPrefix: 'offline-enrollment', callbackUrl: 'https://app.example.invalid/auth/callback',
      logoutUrl: 'https://app.example.invalid/login', enrollmentCallbackUrl: callback
    }), /own same-origin/);
  }
});
