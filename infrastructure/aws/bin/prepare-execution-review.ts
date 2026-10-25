import { executionReviewPackage } from '../lib/execution-review-package.js';
try {
  const [account, region, stackId, changeSetName, expiresAt, extra] = process.argv.slice(2);
  if (!account || !region || !stackId || !changeSetName || !expiresAt || extra) throw new Error('Explicit inputs required');
  console.log(JSON.stringify(executionReviewPackage(account, region, stackId, changeSetName, expiresAt), null, 2));
} catch {
  console.error('Explicit account/us-east-1, stack UUID, reviewed change-set name and UTC expiry within one hour required. No AWS calls performed.');
  process.exitCode = 1;
}
