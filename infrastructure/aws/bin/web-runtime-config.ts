import { readFileSync } from 'node:fs';
import { runtimeConfigFromOutputs } from '../lib/web-runtime-config.js';

const [file, stack, key, extra] = process.argv.slice(2);
try {
  if (!file || !stack || !key || extra) throw new Error('Expected outputs file, stack name and output key');
  const input: unknown = JSON.parse(readFileSync(file, 'utf8'));
  process.stdout.write(runtimeConfigFromOutputs(input, stack, key));
} catch {
  console.error('Cannot generate public runtime config: check outputs file, stack and output key.');
  process.exitCode = 1;
}
