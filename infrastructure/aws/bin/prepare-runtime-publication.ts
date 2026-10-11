import { readFileSync } from 'node:fs';
import { runtimeConfigPlan } from '../lib/runtime-config-plan.js';

try {
  const [outputsFile, targetFile, extra] = process.argv.slice(2);
  if (!outputsFile || !targetFile || extra) throw new Error('Expected outputs and target files');
  const outputs: unknown = JSON.parse(readFileSync(outputsFile, 'utf8'));
  const target: unknown = JSON.parse(readFileSync(targetFile, 'utf8'));
  process.stdout.write(JSON.stringify(runtimeConfigPlan(outputs, target), null, 2) + '\n');
} catch {
  console.error('Publication preparation failed. Check outputs and public target files. No AWS calls performed.');
  process.exitCode = 1;
}
