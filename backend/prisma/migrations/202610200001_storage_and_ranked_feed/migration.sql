ALTER TABLE "Media" ADD COLUMN "storageProvider" VARCHAR(10) NOT NULL DEFAULT 'local', ADD COLUMN "storageBucket" VARCHAR(100), ADD COLUMN "storageKey" VARCHAR(200);
CREATE TABLE "FeedSnapshot" ("id" UUID PRIMARY KEY, "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE, "eventIds" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "FeedSnapshot_expiresAt_idx" ON "FeedSnapshot"("expiresAt");
CREATE INDEX "FeedSnapshot_userId_createdAt_idx" ON "FeedSnapshot"("userId","createdAt");
