import 'dotenv/config';
import 'reflect-metadata';
import { Database } from './database';
import { storeImage, loadImage, removeStoredImage } from './media-storage';
async function main() {
  if (process.env.MEDIA_STORAGE_PROVIDER !== 'r2') throw new Error('R2 must be selected');
  const db = new Database();
  let moved = 0;
  await db.$connect();
  try {
    while (true) {
      const rows = await db.media.findMany({
        where: { storageProvider: 'local' },
        take: 20,
        orderBy: { id: 'asc' },
      });
      if (!rows.length) break;
      for (const row of rows) {
        const bytes = await loadImage(row.id, row);
        const target = await storeImage(row.id, bytes);
        const downloaded = await loadImage(row.id, target);
        if (!downloaded.equals(bytes)) {
          await removeStoredImage(row.id, target);
          throw new Error('Verification failed');
        }
        await db.media.updateMany({
          where: { id: row.id, storageProvider: 'local' },
          data: target,
        });
        moved++;
        console.log('Verified and migrated images:', moved);
      }
    }
    console.log('Migration complete. Local files have been retained for backup.');
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'Media migration stopped. Check storage configuration and availability of the original local files. Already migrated records are retained; rerunning resumes remaining local records.',
  );
  process.exitCode = 1;
});
