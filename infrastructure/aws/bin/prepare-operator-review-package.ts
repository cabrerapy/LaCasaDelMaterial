import { mkdir,mkdtemp,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { operatorReviewPackage } from '../lib/operator-review-package.js';
async function main(){
  const [account,region,outputParent,extra]=process.argv.slice(2);
  if(!account || !region || !outputParent || extra) throw new Error('Explicit target/output required');
  const proposal=operatorReviewPackage(account,region);
  const parent=resolve(outputParent);
  await mkdir(parent,{recursive:true});
  const directory=await mkdtemp(join(parent,'operator-review-'));
  for(const p of proposal.policies) await writeFile(join(directory,p.filename),p.json,{encoding:'utf8',flag:'wx'});
  const manifest={...proposal,policies:proposal.policies.map(({json,...metadata})=>metadata)};
  await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{encoding:'utf8',flag:'wx'});
  console.log(JSON.stringify({directory,...manifest},null,2));
}
void main().catch(()=>{
  console.error('Local package failed; inspect partial local output. No AWS changes made.');
  process.exitCode=1;
});
