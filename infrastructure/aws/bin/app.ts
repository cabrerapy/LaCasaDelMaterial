import { App } from 'aws-cdk-lib';
import { StorageFoundationStack } from '../lib/storage-foundation-stack.js';

const app = new App();
const region: unknown = app.node.tryGetContext('region');
if (typeof region !== 'string' || !/^[a-z]{2}-[a-z]+-\d$/.test(region)) {
  throw new Error('A valid single AWS region is required.');
}
// Account intentionally unresolved: offline synthesis never invents a client account.
new StorageFoundationStack(app, 'LcmProductionFoundation', { env: { region } });
