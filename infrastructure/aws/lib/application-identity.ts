import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { UserPool, UserPoolClient, FeaturePlan, Mfa, AccountRecovery } from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

// Candidate only; not instantiated in app.ts until deployment gates are approved.
export class ApplicationIdentity extends Construct {
  readonly pool: UserPool;
  readonly webClient: UserPoolClient;
  constructor(scope: Construct, id: string) {
    super(scope, id);
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
      refreshTokenValidity: Duration.days(1)
    });
  }
}
