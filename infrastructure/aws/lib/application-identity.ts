import { CfnOutput, Duration, RemovalPolicy, Stack, Token } from 'aws-cdk-lib';
import { UserPool, UserPoolClient, FeaturePlan, Mfa, AccountRecovery, OAuthScope, ClientAttributes } from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface IdentityWebLogin {
  readonly domainPrefix: string;
  readonly callbackUrl: string;
  readonly logoutUrl: string;
  readonly enrollmentCallbackUrl?: string;
}

// Candidate only; not instantiated in app.ts until deployment gates are approved.
export class ApplicationIdentity extends Construct {
  readonly pool: UserPool;
  readonly webClient: UserPoolClient;
  readonly enrollmentClient?: UserPoolClient;
  constructor(scope: Construct, id: string, webLogin?: IdentityWebLogin) {
    super(scope, id);
    if (webLogin) {
      if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(webLogin.domainPrefix)) throw new Error('Invalid Cognito domain prefix');
      for (const value of [webLogin.callbackUrl, webLogin.logoutUrl, ...(webLogin.enrollmentCallbackUrl ? [webLogin.enrollmentCallbackUrl] : [])]) {
        if (Token.isUnresolved(value)) continue;
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Cognito redirect must use HTTPS without query or fragment');
      }
      if (webLogin.enrollmentCallbackUrl && !Token.isUnresolved(webLogin.enrollmentCallbackUrl) &&
        !Token.isUnresolved(webLogin.callbackUrl)) {
        const enrollment = new URL(webLogin.enrollmentCallbackUrl);
        if (enrollment.origin !== new URL(webLogin.callbackUrl).origin || enrollment.pathname !== '/auth/enrollment/callback') {
          throw new Error('Enrollment requires its own same-origin callback');
        }
      }
    }
    this.pool = new UserPool(this, 'Pool', {
      featurePlan: FeaturePlan.LITE,
      selfSignUpEnabled: false,
      signInAliases: { username: true, email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true }, fullname: { required: true, mutable: true } },
      mfa: Mfa.OPTIONAL, mfaSecondFactor: { sms: false, otp: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      passwordPolicy: { minLength: 12, requireLowercase: true, requireUppercase: true,
        requireDigits: true, requireSymbols: true, tempPasswordValidity: Duration.days(3) },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN
    });
    this.webClient = this.pool.addClient('WebClient', {
      generateSecret: false,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.hours(1), idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(1),
      ...(webLogin ? { oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: [webLogin.callbackUrl], logoutUrls: [webLogin.logoutUrl]
      } } : { disableOAuth: true })
    });
    if (webLogin) {
      if (webLogin.enrollmentCallbackUrl) {
        this.enrollmentClient = this.pool.addClient('EnrollmentClient', {
          generateSecret: false, preventUserExistenceErrors: true, enableTokenRevocation: true,
          authFlows: { userSrp: true }, accessTokenValidity: Duration.minutes(10),
          idTokenValidity: Duration.minutes(10), refreshTokenValidity: Duration.hours(1),
          // Required pool attributes remain writable; no other profile/role attributes.
          readAttributes: new ClientAttributes().withStandardAttributes({ email: true, fullname: true }),
          writeAttributes: new ClientAttributes().withStandardAttributes({ email: true, fullname: true }),
          oAuth: { flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
            scopes: [OAuthScope.COGNITO_ADMIN], callbackUrls: [webLogin.enrollmentCallbackUrl],
            logoutUrls: [webLogin.logoutUrl] }
        });
        new CfnOutput(this, 'EnrollmentClientId', { value: this.enrollmentClient.userPoolClientId });
      }
      const domain = this.pool.addDomain('LoginDomain', {
        cognitoDomain: { domainPrefix: webLogin.domainPrefix }, managedLoginVersion: 1
      });
      new CfnOutput(this, 'WebRuntimeConfig', {
        value: Stack.of(this).toJsonString({ authMode: 'cognito', cognito: {
          domain: domain.baseUrl(), clientId: this.webClient.userPoolClientId,
          redirectUri: webLogin.callbackUrl, logoutUri: webLogin.logoutUrl
        }, ...(this.enrollmentClient ? { cognitoEnrollment: {
          domain: domain.baseUrl(), clientId: this.enrollmentClient.userPoolClientId,
          redirectUri: webLogin.enrollmentCallbackUrl, logoutUri: webLogin.logoutUrl
        } } : {}) })
      });
    }
  }
}
