import { mkdirSync, writeFileSync } from 'node:fs';
import { remainingAuthorityReview } from '../dist/lib/remaining-authority-review.js';
const expiry = process.argv[2];
if (!expiry || process.argv.length !== 3) throw new Error('Explicit UTC expiry within one hour required');
const plan = remainingAuthorityReview('088668667831', 'us-east-1', 'b2b93cb0-d0dd-11f1-a355-0e392e77eda7', expiry);
const directory = new URL('../../../.data/operator-application/remaining-authority-20261028/', import.meta.url);
mkdirSync(directory, { recursive: false });
writeFileSync(new URL('review.json', directory), JSON.stringify(plan, null, 2), { flag: 'wx' });
for (const policy of plan.policies) {
  writeFileSync(new URL(`${policy.name}.json`, directory), JSON.stringify(policy.document), { flag: 'wx' });
}
console.log(JSON.stringify({ result: plan.result, policies: plan.policies.length, expiresAt: plan.expiresAt }));
