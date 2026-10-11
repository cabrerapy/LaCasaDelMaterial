import { Duration, RemovalPolicy, Stack, Token } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Function, Runtime, Architecture, type Code } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import type { ApplicationData } from './application-data.js';
import type { ApplicationIdentity } from './application-identity.js';
import { bindApplicationData } from './bind-application-data.js';
import { HttpApi, HttpMethod, CfnStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

interface ApplicationApiProps {
  readonly code: Code;
  readonly data: ApplicationData;
  readonly identity: ApplicationIdentity;
  readonly evidence: IBucket;
  readonly webOrigin: string;
  readonly httpApi?: HttpApi;
}

// Candidate only. Not instantiated by app.ts; no deployed endpoint yet.
export class ApplicationApi extends Construct {
  readonly fn: Function;
  readonly httpApi: HttpApi;
  constructor(scope: Construct, id: string, props: ApplicationApiProps) {
    super(scope, id);
    if (!Token.isUnresolved(props.webOrigin)) {
      const origin = new URL(props.webOrigin);
      if (origin.protocol !== 'https:' || origin.origin !== props.webOrigin) throw new Error('API requires an HTTPS web origin');
    }
    const logs = new LogGroup(this, 'Logs', { retention: RetentionDays.ONE_WEEK, removalPolicy: RemovalPolicy.RETAIN });
    this.fn = new Function(this, 'Handler', {
      code: props.code, handler: 'index.handler', runtime: Runtime.NODEJS_24_X,
      architecture: Architecture.X86_64, memorySize: 512, timeout: Duration.seconds(28),
      reservedConcurrentExecutions: 2, logGroup: logs,
      environment: { NODE_ENV: 'production', AUTH_MODE: 'cognito', WEB_ORIGIN: props.webOrigin,
        COGNITO_USER_POOL_ID: props.identity.pool.userPoolId,
        COGNITO_CLIENT_ID: props.identity.webClient.userPoolClientId,
        DELIVERY_EVIDENCE_BUCKET: props.evidence.bucketName, AWS_ACCOUNT_ID: Stack.of(this).account }
    });
    bindApplicationData(this.fn, props.data);
    this.httpApi = props.httpApi ?? new HttpApi(this, 'HttpApi', { createDefaultStage: true });
    const stage = this.httpApi.defaultStage?.node.defaultChild;
    if (!(stage instanceof CfnStage)) throw new Error('API requires an owned default stage for traffic limits');
    // Beta candidate settings, not a hard cost ceiling or per-user rate limiter.
    stage.defaultRouteSettings = { throttlingRateLimit: 5, throttlingBurstLimit: 10, detailedMetricsEnabled: false };
    this.httpApi.addRoutes({ path: '/api', methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration('RootIntegration', this.fn) });
    this.httpApi.addRoutes({ path: '/api/{proxy+}', methods: [HttpMethod.ANY],
      integration: new HttpLambdaIntegration('ProxyIntegration', this.fn) });
    this.fn.addToRolePolicy(new PolicyStatement({ actions: ['s3:GetObject', 's3:PutObject'],
      resources: [props.evidence.arnForObjects('deliveries/*')], conditions: { Bool: { 'aws:SecureTransport': 'true' } } }));
  }
}
