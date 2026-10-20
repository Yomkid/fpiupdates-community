BEGIN;
CREATE TABLE "Block" (
 "blockerId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "blockedId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("blockerId","blockedId"), CHECK ("blockerId" <> "blockedId")
);
CREATE INDEX "Block_blockedId_idx" ON "Block"("blockedId");
CREATE TABLE "Mute" (
 "muterId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "mutedId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("muterId","mutedId"), CHECK ("muterId" <> "mutedId")
);
CREATE INDEX "Mute_mutedId_idx" ON "Mute"("mutedId");
-- Backfill the original conversation author for older posts and nested replies.
WITH RECURSIVE conversations AS (
 SELECT "id", "authorId" AS owner FROM "Post" WHERE "parentId" IS NULL
 UNION ALL SELECT child."id", root.owner FROM "Post" child JOIN conversations root ON child."parentId"=root."id"
) UPDATE "Post" SET "replyPolicyOwnerId"=conversations.owner FROM conversations
 WHERE "Post"."id"=conversations."id" AND "Post"."replyPolicyOwnerId" IS NULL;
ALTER TABLE "Post" ADD CONSTRAINT "Post_replyPolicyOwnerId_fkey" FOREIGN KEY ("replyPolicyOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Report" ADD COLUMN "reviewedAt" TIMESTAMP(3), ADD COLUMN "reviewedById" UUID, ADD COLUMN "reviewNote" VARCHAR(500);
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status","createdAt");

CREATE INDEX "Post_replyPolicyOwnerId_idx" ON "Post"("replyPolicyOwnerId");

COMMIT;
