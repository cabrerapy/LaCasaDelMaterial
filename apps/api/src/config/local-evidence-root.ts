import { resolve } from 'node:path';

/** Local server only. Lambda keeps its independently configured S3 storage. */
export function localEvidenceRoot(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment['LOCAL_DELIVERY_EVIDENCE_ROOT'];
  if (configured === undefined) return '.data/delivery-evidence';
  if (environment['NODE_ENV'] === 'production') {
    throw new Error('LOCAL_DELIVERY_EVIDENCE_ROOT is only available outside production');
  }
  const root = configured.trim();
  if (!root || root.includes('\0') || /^[a-z][a-z0-9+.-]*:\/\//i.test(root)) {
    throw new Error('LOCAL_DELIVERY_EVIDENCE_ROOT must be a nonempty local filesystem path');
  }
  return resolve(root);
}
