import { App } from 'aws-cdk-lib';
import { Code } from 'aws-cdk-lib/aws-lambda';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ApplicationReviewStack } from '../lib/application-review-stack.js';

const app = new App();
const account: unknown = app.node.tryGetContext('account');
const region: unknown = app.node.tryGetContext('region');
const domainPrefix: unknown = app.node.tryGetContext('cognitoDomainPrefix');
if (typeof account !== 'string' || !/^\d{12}$/.test(account) || typeof region !== 'string' ||
    !/^[a-z]{2}-[a-z]+-\d$/.test(region) || typeof domainPrefix !== 'string' || !domainPrefix) {
  throw new Error('Review requires explicit account, region and cognitoDomainPrefix contexts');
}
const asset = resolve('../../apps/api/dist/lambda-package');
if (!existsSync(resolve(asset, 'index.js')) || !existsSync(resolve(asset, 'package.json'))) {
  throw new Error('Generate and review package:lambda before full synthesis');
}
new ApplicationReviewStack(app, 'LcmApplicationReview', {
  env: { account, region }, cognitoDomainPrefix: domainPrefix, lambdaCode: Code.fromAsset(asset)
});
