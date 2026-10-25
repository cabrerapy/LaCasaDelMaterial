import { executorReviewBundle } from '../lib/executor-review-bundle.js';

try {
  const [account, region, runtimeRoleName, boundaryName, executorRoleName, extra] = process.argv.slice(2);
  if (!account || !region || !runtimeRoleName || !boundaryName || !executorRoleName || extra) throw new Error('Explicit target required');
  console.log(JSON.stringify(executorReviewBundle({ account, region, runtimeRoleName, boundaryName, executorRoleName }), null, 2));
} catch {
  console.error('Expected account, us-east-1, runtime role, boundary and distinct executor role. No AWS changes made.');
  process.exitCode = 1;
}
