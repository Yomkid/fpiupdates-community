BEGIN;
ALTER TABLE "User" ADD COLUMN "profileCoverMediaId" UUID REFERENCES "Media"(id) ON DELETE SET NULL ON UPDATE CASCADE,
 ADD COLUMN "campusIdentity" VARCHAR(20), ADD COLUMN "pinnedPostId" UUID REFERENCES "Post"(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_profileCoverMediaId_idx" ON "User"("profileCoverMediaId");
CREATE INDEX "User_pinnedPostId_idx" ON "User"("pinnedPostId");
CREATE TABLE "DiscoveryCard" (id UUID PRIMARY KEY,kind VARCHAR(20) NOT NULL,title VARCHAR(100) NOT NULL,body VARCHAR(400) NOT NULL,href VARCHAR(500) NOT NULL,enabled BOOLEAN NOT NULL DEFAULT false,"startsAt" TIMESTAMP(3) NOT NULL,"endsAt" TIMESTAMP(3) NOT NULL,position INTEGER NOT NULL DEFAULT 0,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "DiscoveryCard_kind_enabled_startsAt_endsAt_idx" ON "DiscoveryCard"(kind,enabled,"startsAt","endsAt");
UPDATE "Role" SET permissions=ARRAY(SELECT DISTINCT unnest(permissions||ARRAY['discovery.manage'])) WHERE key='administrator';
COMMIT;
