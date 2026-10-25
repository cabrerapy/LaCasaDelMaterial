import { publisherDelegation } from '../lib/publisher-delegation.js';
try {
  const [account, region, hash, keyArn, expiry, extra] = process.argv.slice(2);
  if (!account || !region || !hash || !keyArn || !expiry || extra) throw new Error('Explicit inputs required');
  console.log(JSON.stringify(publisherDelegation(account, region, hash, keyArn, expiry), null, 2));
} catch {
  console.error('Expected account, us-east-1, CDK hash, exact KMS ARN and future canonical UTC expiry within one hour. No AWS changes.');
  process.exitCode = 1;
}
