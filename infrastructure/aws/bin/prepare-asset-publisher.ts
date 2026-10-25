import { assetPublisherProposal } from '../lib/asset-publisher-proposal.js';

try {
  const [account, region, hash, kmsKeyArn, extra] = process.argv.slice(2);
  if (!account || !region || !hash || !kmsKeyArn || extra) throw new Error('Explicit target required');
  console.log(JSON.stringify(assetPublisherProposal(account, region, hash, kmsKeyArn), null, 2));
} catch {
  console.error('Expected account, us-east-1, exact lowercase CDK asset identity and same-account KMS key ARN. No AWS changes made.');
  process.exitCode = 1;
}
