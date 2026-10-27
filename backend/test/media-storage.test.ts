import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { storeImage, loadImage, removeStoredImage } from '../src/media-storage';
test('media locations survive provider changes; R2 keys remain private and cleanup targets the recorded bucket', async () => {
  const keys = [
    'MEDIA_DIRECTORY',
    'MEDIA_STORAGE_PROVIDER',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
    'NEON_STORAGE_ENDPOINT',
    'NEON_STORAGE_REGION',
    'NEON_STORAGE_ACCESS_KEY_ID',
    'NEON_STORAGE_SECRET_ACCESS_KEY',
    'NEON_STORAGE_BUCKET',
  ];
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const dir = await mkdtemp(join(tmpdir(), 'fpi-storage-'));
  const send = S3Client.prototype.send;
  const objects = new Map<string, Buffer>();
  const id = randomUUID();
  try {
    process.env.MEDIA_DIRECTORY = dir;
    process.env.MEDIA_STORAGE_PROVIDER = 'local';
    const bytes = Buffer.from('test compressed bytes');
    const local = await storeImage(id, bytes);
    assert.equal(local.storageProvider, 'local');
    process.env.MEDIA_STORAGE_PROVIDER = 'r2';
    process.env.R2_ACCOUNT_ID = 'a'.repeat(32);
    process.env.R2_ACCESS_KEY_ID = 'test';
    process.env.R2_SECRET_ACCESS_KEY = 'test';
    process.env.R2_BUCKET = 'fpi-test';
    (S3Client.prototype as any).send = async (command: any) => {
      const key = command.input.Bucket + '/' + command.input.Key;
      if (command instanceof PutObjectCommand) {
        assert.equal(command.input.ContentType, 'image/webp');
        objects.set(key, command.input.Body as Buffer);
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const b = objects.get(key);
        if (!b) throw Error('missing');
        return { Body: { transformToByteArray: async () => b } };
      }
      if (command instanceof DeleteObjectCommand) {
        objects.delete(key);
        return {};
      }
      throw Error('Unexpected command');
    };
    assert.deepEqual(await loadImage(id, local), bytes);
    const cloud = await storeImage(id, bytes);
    assert.equal(cloud.storageBucket, 'fpi-test');
    assert.equal(cloud.storageKey, 'images/' + id + '.webp');
    process.env.R2_BUCKET = 'different-bucket';
    assert.deepEqual(await loadImage(id, cloud), bytes);
    await removeStoredImage(id, cloud);
    assert.equal(objects.size, 0);
    process.env.MEDIA_STORAGE_PROVIDER = 'neon';
    process.env.NEON_STORAGE_ENDPOINT = 'https://br-test.storage.c-2.us-east-1.aws.neon.tech';
    process.env.NEON_STORAGE_REGION = 'us-east-1';
    process.env.NEON_STORAGE_ACCESS_KEY_ID = 'test';
    process.env.NEON_STORAGE_SECRET_ACCESS_KEY = 'test';
    process.env.NEON_STORAGE_BUCKET = 'fpi-neon-test';
    const neonLocation = await storeImage(id, bytes);
    assert.equal(neonLocation.storageProvider, 'neon');
    process.env.MEDIA_STORAGE_PROVIDER = 'local';
    assert.deepEqual(await loadImage(id, neonLocation), bytes);
    await removeStoredImage(id, neonLocation);
    assert.equal(objects.size, 0);
    await removeStoredImage(id, local);
  } finally {
    S3Client.prototype.send = send;
    for (const k of keys) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
    await rm(dir, { recursive: true, force: true });
  }
});
