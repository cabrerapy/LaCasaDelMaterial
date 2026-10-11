import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Offline bundling using the esbuild installation locked by the Angular workspace.
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const apiRoot = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(apiRoot, 'dist', 'lambda-package');
const result = await build({
  absWorkingDir: apiRoot,
  entryPoints: ['src/lambda.ts'], outfile: path.join(output, 'index.js'),
  bundle: true, platform: 'node', target: 'node24', format: 'cjs',
  packages: 'bundle', metafile: true, write: false, sourcemap: false,
  legalComments: 'none'
});
for (const input of Object.keys(result.metafile.inputs)) {
  if (/(?:argon2|jsonwebtoken|dotenv|local-jwt-authentication|local-delivery-evidence\.storage|bootstrap-admin|src\/server\.ts)/.test(input)) {
    throw new Error(`Forbidden local dependency in Lambda bundle: ${input}`);
  }
}
if (result.outputFiles.length !== 1) throw new Error('Unexpected Lambda bundle outputs');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'index.js'), result.outputFiles[0].contents);
await writeFile(path.join(output, 'package.json'), JSON.stringify({ private: true, type: 'commonjs' }));
await writeFile(path.join(apiRoot, 'dist', 'lambda-metafile.json'), JSON.stringify(result.metafile));
const bundled = require(path.join(output, 'index.js'));
if (typeof bundled.handler !== 'function') throw new Error('Missing bundled Lambda handler');
console.log(JSON.stringify({ result: 'OFFLINE PACKAGE READY, NOT DEPLOYED', handler: 'index.handler',
  output, bytes: result.outputFiles[0].contents.byteLength }));
