import { Stack, CfnOutput, RemovalPolicy, Tags, type StackProps } from 'aws-cdk-lib';
import { Bucket, BlockPublicAccess, BucketEncryption, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import type { Code } from 'aws-cdk-lib/aws-lambda';
import type { Construct } from 'constructs';
import { FrontendDelivery } from './frontend-delivery.js';
import { ApplicationIdentity } from './application-identity.js';
import { ApplicationData } from './application-data.js';
import { ApplicationApi } from './application-api.js';

interface ReviewStackProps extends StackProps {
  readonly lambdaCode: Code;
  readonly cognitoDomainPrefix: string;
  readonly runtimeGuardrail?: { readonly roleName: string; readonly boundaryArn: string };
}

// Offline candidate, never selected by the default app/deploy workflow.
export class ApplicationReviewStack extends Stack {
  constructor(scope: Construct, id: string, props: ReviewStackProps) {
    super(scope, id, props);
    const buckets = ['Frontend', 'Evidence'].map(name => new Bucket(this, name, {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL, encryption: BucketEncryption.S3_MANAGED,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED, enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN, autoDeleteObjects: false
    }));
    const frontendBucket = buckets[0]!, evidenceBucket = buckets[1]!;
    // API resource exists independently of integration/Lambda: distribution can reference
    // its hostname without depending on identity or Lambda environment (no cycle).
    const httpApi = new HttpApi(this, 'HttpApi', { createDefaultStage: true });
    const frontend = new FrontendDelivery(this, 'Web', frontendBucket, httpApi);
    const webOrigin = `https://${frontend.distribution.distributionDomainName}`;
    const identity = new ApplicationIdentity(this, 'Identity', {
      domainPrefix: props.cognitoDomainPrefix, callbackUrl: `${webOrigin}/auth/callback`, logoutUrl: `${webOrigin}/login`,
      enrollmentCallbackUrl: `${webOrigin}/auth/enrollment/callback`
    });
    const data = new ApplicationData(this, 'Data');
    new ApplicationApi(this, 'Api', { code: props.lambdaCode, data, identity, evidence: evidenceBucket, webOrigin, httpApi,
      ...(props.runtimeGuardrail ? { runtimeGuardrail: props.runtimeGuardrail } : {}) });
    new CfnOutput(this, 'WebOrigin', { value: webOrigin });
    new CfnOutput(this, 'FrontendBucketName', { value: frontendBucket.bucketName });
    new CfnOutput(this, 'EvidenceBucketName', { value: evidenceBucket.bucketName });
    Tags.of(this).add('Project', 'LaCasaDelMaterial');
    Tags.of(this).add('Environment', 'production');
  }
}
