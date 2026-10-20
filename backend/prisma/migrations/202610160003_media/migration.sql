BEGIN;
CREATE TABLE "Media" (
 "id" UUID NOT NULL, "ownerId" UUID NOT NULL, "kind" VARCHAR(10) NOT NULL,
 "bytes" INTEGER NOT NULL, "width" INTEGER NOT NULL, "height" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Media_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Media_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Media_ownerId_createdAt_idx" ON "Media"("ownerId", "createdAt");
ALTER TABLE "User" ADD COLUMN "avatarMediaId" UUID;
ALTER TABLE "Post" ADD COLUMN "imageMediaId" UUID, ADD COLUMN "imageAlt" VARCHAR(500);
ALTER TABLE "Article" ADD COLUMN "coverMediaId" UUID, ADD COLUMN "coverAlt" VARCHAR(500);
ALTER TABLE "User" ADD CONSTRAINT "User_avatarMediaId_fkey" FOREIGN KEY ("avatarMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_imageMediaId_fkey" FOREIGN KEY ("imageMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Article" ADD CONSTRAINT "Article_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_avatarMediaId_idx" ON "User"("avatarMediaId");
CREATE INDEX "Post_imageMediaId_idx" ON "Post"("imageMediaId");
CREATE INDEX "Article_coverMediaId_idx" ON "Article"("coverMediaId");
COMMIT;
