# Persistent images with Cloudflare R2

No live bucket is connected by this package. Keep credentials in backend/.env or the host's secret environment, never in React variables, GitHub or chat. R2 billing/allowances are controlled by Cloudflare; review its dashboard before activation. The app's existing 512 MB total, 100 MB/account and 50 uploads/account/day limits remain. These are application limits, independent of R2's allowance.

## Setup

1. Create a Cloudflare account, enable R2 and review billing requirements. Create a **Standard** bucket named, for example, fpiupdates-staging. Keep public access and r2.dev disabled. No purchased domain is needed for this private-bucket setup.
2. Create an R2 object read/write API token restricted to this bucket. Record the S3 Access Key ID and Secret Access Key privately. Copy your account ID (32 hexadecimal characters).
3. Set these variables in backend/.env, or the hosting dashboard:

```
MEDIA_STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET=fpiupdates-staging
MEDIA_UPLOADS_DISABLED=true
```

4. From the backend directory run `npm.cmd run storage:test`. This explicitly writes a 2-pixel WebP under a random images/ key, downloads and compares the bytes, deletes it, and checks that it is gone. It does not modify the database. Success must report both upload/download and deletion verified. A failure prints no secrets. If interrupted, a tiny orphan test object can remain; remove that object in the bucket dashboard.
5. Only after a successful test, set `MEDIA_UPLOADS_DISABLED=false` and restart/redeploy the backend. In Admin → Feature releases keep **Post image uploads** disabled for a text-first feed. Profile pictures and profile covers can then work. Article covers still require publishing enabled and editorial permission; sports images require sports enabled and management permission.
6. Upload a profile picture and cover, save the profile, check it as another account, restart/redeploy the app and check again. Try an invalid file and an image above 5 MB; neither should be accepted. Existing access checks still apply before the backend reads any cloud image.

Render's supplied configuration leaves all uploads paused until you explicitly change it after testing. R2 persistence does not prevent a free application host from sleeping or experiencing outages. Backups are still needed.

## Existing local images

New Media rows store provider, bucket and object key. Historical rows default to local, so choosing R2 **does not automatically move old files** and does not break local reading. Keep your previous uploads folder and database backup.

Before moving a populated local installation to a host with ephemeral disk:

- Back up the database and original uploads folder. Stop user traffic/uploads and run only one migration process.
- Run the additive database migrations using the upgrade script.
- Configure R2 and pass the storage test above.
- From backend run `npm.cmd run storage:migrate` against the database whose media records you intend to migrate, with MEDIA_DIRECTORY pointing to the original uploads folder (an absolute path is safest).
- The command uploads each remaining local record, reads it back and compares exact bytes, then changes that record's location. It retains all original files. If interrupted, rerun to resume remaining local records. Failure stops the process; already moved records remain valid. Do not run this against a different database by mistake.
- Verify profiles/posts/covers, then transfer the resulting database to staging when appropriate. Keep original files and backups until restoration has been tested.

Images are served through the existing /api/v1/media/:id endpoint, after authorization. The browser never receives storage keys or credentials. This initial implementation proxies reads through NestJS; it does not yet provide a public CDN delivery path. Separate backup retention and cleanup of unreferenced historical uploads remain operator responsibilities; changing/removing an attachment does not automatically erase all old uploads.

## Provider changes and failures

Each row retains its original provider and bucket. R2 credential/account changes require a backend restart. A bucket rename or move requires a deliberate migration; changing R2_BUCKET affects new uploads only. Failed writes do not create image rows; a failed database commit attempts to delete the just-written object. A failed cleanup logs its image ID for operator investigation. A storage outage rejects uploads and existing image reads fail gracefully; text remains available. Do not rotate through free accounts automatically.

Official references: https://developers.cloudflare.com/r2/pricing/ and https://developers.cloudflare.com/r2/api/s3/ and https://developers.cloudflare.com/r2/reference/durability/
