import { assetPublicationPlan } from '../lib/asset-publication-plan.js';

try {
  const [account, region, hash, extra] = process.argv.slice(2);
  if (!account || !region || !hash || extra) throw new Error('Explicit target required');
  console.log(JSON.stringify(assetPublicationPlan(account, region, hash), null, 2));
} catch {
  console.error('Expected account, us-east-1 and exact lowercase CDK SHA-256 asset identity. No AWS changes made.');
  process.exitCode = 1;
}
