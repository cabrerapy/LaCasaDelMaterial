import { Stack, CfnOutput, RemovalPolicy, Tags, type StackProps } from 'aws-cdk-lib';
import { Bucket, BlockPublicAccess, BucketEncryption, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import type { Code } from 'aws-cdk-lib/aws-lambda';
import type { Construct } from 'constructs';
import { FrontendDelivery } from './frontend-delivery.js';
import { ApplicationIdentity } from './application-identity.js';
import { ApplicationData } from './application-data.js';
import { ApplicationApi } from './application-api.js';
import { runtimeResourceNames } from './runtime-resource-names.js';
import { runtimeBoundaryPolicy } from './runtime-boundary-policy.js';

interface ReviewStackProps extends StackProps {
  readonly lambdaCode: Code;
  readonly cognitoDomainPrefix: string;
  readonly runtimeGuardrail?: { readonly roleName: string; readonly boundaryArn: string };
}

// Offline candidate, never selected by the default app/deploy workflow.
export class ApplicationReviewStack extends Stack {
  constructor(scope: Construct, id: string, props: ReviewStackProps) {
    super(scope, id, props);
    const names = props.runtimeGuardrail ? runtimeResourceNames(this.account, this.region) : undefined;
    // Validate the same names with the boundary generator before defining resources.
    if (names) runtimeBoundaryPolicy(names);
    const buckets = ['Frontend', 'Evidence'].map(name => new Bucket(this, name, {
      ...(names ? { bucketName: name === 'Frontend' ? names.frontendBucket : names.evidenceBucket } : {}),
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL, encryption: BucketEncryption.S3_MANAGED,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED, enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN, autoDeleteObjects: false
    }));
    const frontendBucket = buckets[0]!, evidenceBucket = buckets[1]!;
    // API resource exists independently of integration/Lambda: distribution can reference
    // its hostname without depending on identity or Lambda environment (no cycle).
    const httpApi = new HttpApi(this, 'HttpApi', { createDefaultStage: true,
      ...(names ? { apiName: names.apiName } : {}) });
    const frontend = new FrontendDelivery(this, 'Web', frontendBucket, httpApi, names?.edgeFunctionName);
    const webOrigin = `https://${frontend.distribution.distributionDomainName}`;
    const identity = new ApplicationIdentity(this, 'Identity', {
      domainPrefix: props.cognitoDomainPrefix, callbackUrl: `${webOrigin}/auth/callback`, logoutUrl: `${webOrigin}/login`,
      enrollmentCallbackUrl: `${webOrigin}/auth/enrollment/callback`
    });
    const data = new ApplicationData(this, 'Data', names?.tables);
    new ApplicationApi(this, 'Api', { code: props.lambdaCode, data, identity, evidence: evidenceBucket, webOrigin, httpApi,
      ...(props.runtimeGuardrail ? { runtimeGuardrail: props.runtimeGuardrail } : {}),
      ...(names ? { logGroupName: names.logGroup, functionName: names.functionName } : {}) });
    new CfnOutput(this, 'WebOrigin', { value: webOrigin });
    new CfnOutput(this, 'FrontendBucketName', { value: frontendBucket.bucketName });
    new CfnOutput(this, 'EvidenceBucketName', { value: evidenceBucket.bucketName });
    Tags.of(this).add('Project', 'LaCasaDelMaterial');
    Tags.of(this).add('Environment', 'production');
  }
}
