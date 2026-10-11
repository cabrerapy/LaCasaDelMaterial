import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { UserPool, UserPoolClient, FeaturePlan, Mfa, AccountRecovery, OAuthScope } from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface IdentityWebLogin {
  readonly domainPrefix: string;
  readonly callbackUrl: string;
  readonly logoutUrl: string;
}

// Candidate only; not instantiated in app.ts until deployment gates are approved.
export class ApplicationIdentity extends Construct {
  readonly pool: UserPool;
  readonly webClient: UserPoolClient;
  constructor(scope: Construct, id: string, webLogin?: IdentityWebLogin) {
    super(scope, id);
    if (webLogin) {
      if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(webLogin.domainPrefix)) throw new Error('Invalid Cognito domain prefix');
      for (const value of [webLogin.callbackUrl, webLogin.logoutUrl]) {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Cognito redirect must use HTTPS without query or fragment');
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
      const domain = this.pool.addDomain('LoginDomain', {
        cognitoDomain: { domainPrefix: webLogin.domainPrefix }, managedLoginVersion: 1
      });
      new CfnOutput(this, 'WebRuntimeConfig', {
        value: Stack.of(this).toJsonString({ authMode: 'cognito', cognito: {
          domain: domain.baseUrl(), clientId: this.webClient.userPoolClientId,
          redirectUri: webLogin.callbackUrl, logoutUri: webLogin.logoutUrl
        } })
      });
    }
  }
}
