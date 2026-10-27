import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
export type MediaLocation = {
  storageProvider: string;
  storageBucket: string | null;
  storageKey: string | null;
};
export const mediaDirectory = () => resolve(process.env.MEDIA_DIRECTORY || '.uploads');
let client: S3Client | undefined;
let neonClient: S3Client | undefined;
function neon() {
  const endpoint = process.env.NEON_STORAGE_ENDPOINT;
  const region = process.env.NEON_STORAGE_REGION;
  const accessKeyId = process.env.NEON_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.NEON_STORAGE_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !accessKeyId || !secretAccessKey)
    throw new Error('Neon storage configuration is incomplete');
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new Error('Invalid Neon storage endpoint'); }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.storage.c-2.us-east-1.aws.neon.tech') && !/\.storage\.c-[0-9]+\.[a-z0-9-]+\.aws\.neon\.tech$/.test(url.hostname) || url.username || url.password || url.search || url.hash || url.port || url.pathname !== '/')
    throw new Error('Invalid Neon storage endpoint');
  return (neonClient ??= new S3Client({
    region, endpoint: url.origin, forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 },
  }));
}
function r2() {
  const account = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!account || !/^[a-f0-9]{32}$/i.test(account) || !accessKeyId || !secretAccessKey)
    throw new Error('R2 storage configuration is incomplete');
  return (client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 },
  }));
}
export async function storeImage(id: string, data: Buffer): Promise<MediaLocation> {
  const provider = process.env.MEDIA_STORAGE_PROVIDER || 'local';
  if (provider === 'local') {
    await mkdir(mediaDirectory(), { recursive: true, mode: 0o700 });
    await writeFile(join(mediaDirectory(), id + '.webp'), data, { flag: 'wx', mode: 0o600 });
    return { storageProvider: 'local', storageBucket: null, storageKey: null };
  }
  if (provider !== 'r2' && provider !== 'neon') throw new Error('Unknown media storage provider');
  const bucket = provider === 'r2' ? process.env.R2_BUCKET : process.env.NEON_STORAGE_BUCKET;
  if (!bucket || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))
    throw new Error('Set a valid storage bucket');
  const key = 'images/' + id + '.webp';
  await (provider === 'r2' ? r2() : neon()).send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: 'image/webp' }),
  );
  return { storageProvider: provider, storageBucket: bucket, storageKey: key };
}
export async function loadImage(id: string, location: MediaLocation): Promise<Buffer> {
  if (location.storageProvider === 'local') return readFile(join(mediaDirectory(), id + '.webp'));
  if (!['r2', 'neon'].includes(location.storageProvider) || !location.storageBucket || !location.storageKey)
    throw new Error('Invalid media location');
  const result = await (location.storageProvider === 'r2' ? r2() : neon()).send(
    new GetObjectCommand({ Bucket: location.storageBucket, Key: location.storageKey }),
  );
  if (!result.Body) throw new Error('Image unavailable');
  return Buffer.from(await result.Body.transformToByteArray());
}
export async function removeStoredImage(id: string, location: MediaLocation) {
  if (location.storageProvider === 'local') return unlink(join(mediaDirectory(), id + '.webp'));
  if (!['r2', 'neon'].includes(location.storageProvider) || !location.storageBucket || !location.storageKey)
    throw new Error('Invalid media location');
  await (location.storageProvider === 'r2' ? r2() : neon()).send(
    new DeleteObjectCommand({ Bucket: location.storageBucket, Key: location.storageKey }),
  );
}
