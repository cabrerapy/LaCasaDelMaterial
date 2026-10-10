import { RemovalPolicy, Stack, type StackProps, Tags } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, BucketEncryption, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

/** Phase A foundation only. Not a deployable complete application. */
export class StorageFoundationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    for (const name of ['Frontend', 'DeliveryEvidence']) {
      new Bucket(this, `${name}Bucket`, {
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        encryption: BucketEncryption.S3_MANAGED,
        objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
        enforceSSL: true,
        removalPolicy: RemovalPolicy.RETAIN,
        autoDeleteObjects: false,
      });
    }
    Tags.of(this).add('Project', 'LaCasaDelMaterial');
    Tags.of(this).add('Environment', 'production');
  }
}
