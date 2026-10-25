import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { executorPermanentPackage } from '../lib/executor-permanent-package.js';

// Local artifact generation only. No AWS imports or Apply mode.
async function main() {
  const [account,region,runtimeRoleName,boundaryName,executorRoleName,assetHash,outputParent,extra] = process.argv.slice(2);
  if (!account || !region || !runtimeRoleName || !boundaryName || !executorRoleName || !assetHash || !outputParent || extra) {
    throw new Error('Explicit scope and local output parent required');
  }
  const proposal=executorPermanentPackage({account,region,runtimeRoleName,boundaryName,executorRoleName},assetHash);
  const parent=resolve(outputParent);
  await mkdir(parent,{recursive:true});
  const directory=await mkdtemp(join(parent,'permanent-'));
  for (const policy of proposal.policies) await writeFile(join(directory,policy.filename),policy.json,{encoding:'utf8',flag:'wx'});
  const manifest={...proposal,policies:proposal.policies.map(({json,...metadata}) => metadata)};
  await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{encoding:'utf8',flag:'wx'});
  console.log(JSON.stringify({directory,...manifest},null,2));
}
void main().catch(() => {
  console.error('Local package preparation failed; no AWS changes. Inspect any partial local output; do not treat it as approved.');
  process.exitCode=1;
});
