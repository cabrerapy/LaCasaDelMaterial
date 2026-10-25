import { operatorStackPlan } from '../lib/operator-stack-plan.js';
try {
  const [account,region,extra]=process.argv.slice(2);
  if(!account || !region || extra) throw new Error('Explicit target required');
  console.log(JSON.stringify(operatorStackPlan(account,region),null,2));
} catch {
  console.error('Explicit account and us-east-1 required. No AWS changes made.');
  process.exitCode=1;
}
