import { readdir, readFile, lstat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Offline inventory only. Never uploads or treats the development config as production.
export async function reviewWebRelease(directory) {
  const root = resolve(directory);
  const files = [];
  const excluded = [];
  async function visit(path) {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error('Symbolic links are not release inputs');
    if (stat.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await visit(resolve(path, name));
      return;
    }
    if (!stat.isFile()) throw new Error('Unsupported release input');
    const key = relative(root, path).split(sep).join('/');
    if (key === 'runtime-config.json') {
      excluded.push(key);
      return;
    }
    if (/(^|\/)\.|\.map$|\.(pem|key|pfx)$/i.test(key)) throw new Error('Unexpected release input');
    const bytes = await readFile(path);
    files.push({ key, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      cacheControl: key === 'index.html' ? 'no-store, max-age=0' : 'public, max-age=3600' });
  }
  await visit(root);
  if (!files.some(file => file.key === 'index.html') || !files.some(file => file.key.endsWith('.js'))) {
    throw new Error('Missing browser entrypoint or JavaScript bundle');
  }
  return { result: 'OFFLINE_WEB_INVENTORY_NOT_PUBLISHED', awsCalls: false, readyForPublication: false,
    files, excluded, pending: ['Generate and verify Cognito runtime-config from real stack outputs',
      'Approve exact bucket, publisher permissions and publication', 'HTTPS smoke after publication'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Explicit browser build directory required');
    console.log(JSON.stringify(await reviewWebRelease(process.argv[2]), null, 2));
  } catch {
    console.error('Web release inventory failed; no AWS calls or publication performed.');
    process.exitCode = 1;
  }
}
