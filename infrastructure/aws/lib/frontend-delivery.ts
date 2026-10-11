import { Duration } from 'aws-cdk-lib';
import { CachePolicy, Distribution, Function, FunctionCode, FunctionEventType,
  FunctionRuntime, ResponseHeadersPolicy, ViewerProtocolPolicy, AllowedMethods, OriginRequestPolicy } from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin, HttpOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import type { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { Fn } from 'aws-cdk-lib';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { SPA_ROUTING_CODE } from './spa-routing.js';

/** Offline construct; not instantiated until pricing/plan review is complete. */
export class FrontendDelivery extends Construct {
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, bucket: IBucket, api?: HttpApi) {
    super(scope, id);
    const routing = new Function(this, 'SpaRouting', {
      code: FunctionCode.fromInline(SPA_ROUTING_CODE), runtime: FunctionRuntime.JS_2_0,
    });
    const origin = S3BucketOrigin.withOriginAccessControl(bucket);
    const headers = ResponseHeadersPolicy.SECURITY_HEADERS;
    const apiBehavior = api ? {
      origin: new HttpOrigin(Fn.select(2, Fn.split('/', api.apiEndpoint))),
      viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: AllowedMethods.ALLOW_ALL,
      cachePolicy: CachePolicy.CACHING_DISABLED,
      // Includes Authorization, cookies and query; excludes viewer Host required by API Gateway.
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: headers,
    } : undefined;
    this.distribution = new Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin, viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_DISABLED, responseHeadersPolicy: headers,
        functionAssociations: [{ function: routing, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        ...(apiBehavior ? { 'api': apiBehavior, 'api/*': apiBehavior } : {}),
        'runtime-config.json': { origin, viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: CachePolicy.CACHING_DISABLED, responseHeadersPolicy: headers },
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
