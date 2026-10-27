import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { storeImage, loadImage, removeStoredImage } from './media-storage';
async function main() {
  if (!['r2', 'neon'].includes(process.env.MEDIA_STORAGE_PROVIDER ?? ''))
    throw new Error('Select a cloud media storage provider first');
  const id = randomUUID();
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#15803d' } })
    .webp()
    .toBuffer();
  const location = await storeImage(id, image);
  let failure: unknown;
  try {
    const read = await loadImage(id, location);
    if (!read.equals(image)) throw new Error('Stored image did not match');
    console.log('Cloud storage upload and download verified.');
  } catch (error) {
    failure = error;
  } finally {
    await removeStoredImage(id, location);
  }
  try {
    await loadImage(id, location);
    throw new Error('Deleted test image is still readable');
  } catch (error) {
    if (
      (error as { name?: string }).name !== 'NoSuchKey' &&
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404
    )
      throw error;
  }
  if (failure) throw failure;
  console.log('Cloud storage deletion verified. No database or profile data changed.');
}
main().catch(() => {
  console.error(
    'Storage test failed. Check settings, bucket permissions and connectivity; no credentials are printed.',
  );
  process.exitCode = 1;
});
