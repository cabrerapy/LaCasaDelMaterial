import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, type PutObjectCommandOutput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { matchesEvidenceContent } from '../application/evidence-content.js';
import type { DeliveryEvidenceStorage } from '../domain/delivery-evidence.storage.js';

interface ObjectWriter { send(command: PutObjectCommand): Promise<PutObjectCommandOutput>; }
type ReadSigner = (command: GetObjectCommand, expiresIn: number) => Promise<string>;
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' } as const;
type Extension = keyof typeof MIME;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const KEY = new RegExp(`^deliveries/${UUID}/${UUID}\\.(jpg|png|webp|pdf)$`, 'i');

// Candidate object storage; not the filesystem interface. Never fabricates an absolutePath.
export class S3DeliveryEvidenceStorage implements DeliveryEvidenceStorage {
  constructor(private readonly bucket: string, private readonly owner: string,
    private readonly client: ObjectWriter, private readonly signer: ReadSigner) {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes('..') || !/^\d{12}$/.test(owner)) {
      throw new Error('Invalid evidence bucket configuration');
    }
  }
  async save(deliveryId: string, extension: string, content: Buffer): Promise<{ storageKey: string }> {
    if (!new RegExp(`^${UUID}$`, 'i').test(deliveryId) || !Object.hasOwn(MIME, extension) ||
      content.length === 0 || content.length > 5 * 1024 * 1024) throw new Error('Invalid evidence object');
    const mimeType = MIME[extension as Extension];
    if (!matchesEvidenceContent(mimeType, content)) throw new Error('Invalid evidence content');
    const storageKey = `deliveries/${deliveryId}/${randomUUID()}.${extension}`;
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, ExpectedBucketOwner: this.owner,
      Key: storageKey, Body: content, ContentType: mimeType, CacheControl: 'no-store',
      ServerSideEncryption: 'AES256', IfNoneMatch: '*' }));
    return { storageKey };
  }
  // Caller must authorize user/role/trip before calling. URL is a temporary bearer capability.
  async signedRead(storageKey: string): Promise<string> {
    if (!KEY.test(storageKey)) throw new Error('Invalid evidence storage key');
    const url = await this.signer(new GetObjectCommand({ Bucket: this.bucket, ExpectedBucketOwner: this.owner,
      Key: storageKey, ResponseCacheControl: 'no-store', ResponseContentDisposition: 'attachment' }), 60);
    if (new URL(url).protocol !== 'https:') throw new Error('Invalid evidence download URL');
    return url;
  }
  async resolve(_storageKey: string): Promise<string> {
    throw new Error('S3 evidence requires an authorized signed download');
  }
}
export function createS3DeliveryEvidenceStorage(region: string, bucket: string, owner: string): S3DeliveryEvidenceStorage {
  if (!/^[a-z]{2}-[a-z]+-\d$/.test(region)) throw new Error('Invalid evidence region');
  const client = new S3Client({ region, maxAttempts: 3, ignoreConfiguredEndpointUrls: true });
  return new S3DeliveryEvidenceStorage(bucket, owner, client,
    (command, expiresIn) => getSignedUrl(client, command, { expiresIn }));
}
