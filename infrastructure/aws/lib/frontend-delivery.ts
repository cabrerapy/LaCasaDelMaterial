import { Duration } from 'aws-cdk-lib';
import { CachePolicy, Distribution, Function, FunctionCode, FunctionEventType,
  FunctionRuntime, ResponseHeadersPolicy, ViewerProtocolPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { SPA_ROUTING_CODE } from './spa-routing.js';

/** Offline construct; not instantiated until pricing/plan review is complete. */
export class FrontendDelivery extends Construct {
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, bucket: IBucket) {
    super(scope, id);
    const routing = new Function(this, 'SpaRouting', {
      code: FunctionCode.fromInline(SPA_ROUTING_CODE), runtime: FunctionRuntime.JS_2_0,
    });
    const origin = S3BucketOrigin.withOriginAccessControl(bucket);
    const headers = ResponseHeadersPolicy.SECURITY_HEADERS;
    this.distribution = new Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin, viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_DISABLED, responseHeadersPolicy: headers,
        functionAssociations: [{ function: routing, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '*.js': { origin, viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED, responseHeadersPolicy: headers },
        '*.css': { origin, viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED, responseHeadersPolicy: headers },
        'assets/*': { origin, viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new CachePolicy(this, 'AssetCache', {
            minTtl: Duration.seconds(0), defaultTtl: Duration.hours(1), maxTtl: Duration.days(1),
            enableAcceptEncodingBrotli: true, enableAcceptEncodingGzip: true,
          }), responseHeadersPolicy: headers },
      },
    });
  }
}
