BEGIN;
ALTER TABLE "Post" ADD COLUMN "threadRootId" UUID REFERENCES "Post"(id) ON DELETE SET NULL ON UPDATE CASCADE, ADD COLUMN "isThreadContinuation" BOOLEAN NOT NULL DEFAULT false,ADD COLUMN "authorReply" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Post_threadRootId_isThreadContinuation_createdAt_id_idx" ON "Post"("threadRootId","isThreadContinuation","createdAt",id);
WITH RECURSIVE tree AS (
 SELECT id,id AS root,"authorId" AS owner,"authorId",true AS continuous,ARRAY[id] AS path FROM "Post" WHERE "parentId" IS NULL
 UNION ALL
 SELECT p.id,t.root,t.owner,p."authorId",t.continuous AND p."authorId"=t."authorId",t.path||p.id FROM "Post" p JOIN tree t ON p."parentId"=t.id WHERE NOT p.id=ANY(t.path)
) UPDATE "Post" p SET "threadRootId"=t.root,"isThreadContinuation"=t.continuous,"authorReply"=p."authorId"=t.owner FROM tree t WHERE p.id=t.id AND p.id<>t.root;
CREATE TABLE "ThreadPublication" (id UUID PRIMARY KEY,"userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,"requestId" UUID NOT NULL,"rootPostId" UUID NOT NULL REFERENCES "Post"(id) ON DELETE CASCADE ON UPDATE CASCADE,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "ThreadPublication_rootPostId_key" ON "ThreadPublication"("rootPostId");
CREATE UNIQUE INDEX "ThreadPublication_userId_requestId_key" ON "ThreadPublication"("userId","requestId");
UPDATE "Menu" SET path='/home' WHERE path='/';
COMMIT;
