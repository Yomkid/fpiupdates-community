BEGIN;
ALTER TABLE "Article" ADD COLUMN "bodyFormat" VARCHAR(10) NOT NULL DEFAULT 'PLAIN', ADD COLUMN "discussionPostId" UUID;
CREATE UNIQUE INDEX "Article_discussionPostId_key" ON "Article"("discussionPostId");
UPDATE "Role" SET permissions = array_append(permissions, 'articles.manage') WHERE key = 'administrator' AND NOT ('articles.manage' = ANY(permissions));
-- Existing published articles get exactly one discussion post; original text and URLs survive.
UPDATE "Article" SET "discussionPostId" = gen_random_uuid() WHERE status = 'PUBLISHED';
INSERT INTO "Post" (id, body, "authorId", "createdAt", "updatedAt")
SELECT "discussionPostId", left(title || E'\n\n' || excerpt, 1000), "authorId", COALESCE("publishedAt", "createdAt"), now() FROM "Article" WHERE "discussionPostId" IS NOT NULL;
ALTER TABLE "Article" ADD CONSTRAINT "Article_discussionPostId_fkey" FOREIGN KEY ("discussionPostId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
