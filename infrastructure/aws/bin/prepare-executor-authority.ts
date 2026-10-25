import { executorAuthorityPlan } from '../lib/executor-authority-plan.js';
try {
  const [account, region, extra] = process.argv.slice(2);
  if (!account || !region || extra) throw new Error('Explicit target required');
  console.log(JSON.stringify(executorAuthorityPlan(account, region), null, 2));
} catch {
  console.error('Expected explicit account and us-east-1. Review only; no AWS changes.');
  process.exitCode = 1;
}
