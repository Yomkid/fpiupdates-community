-- AlterTable
ALTER TABLE "User" ADD COLUMN     "department" VARCHAR(100),
ADD COLUMN     "website" VARCHAR(500);

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "communityId" UUID,
ADD COLUMN     "topicId" UUID;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "snapshot" VARCHAR(1000),
ADD COLUMN     "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN';

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "key" VARCHAR(50) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "permissions" TEXT[],

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "Menu" (
    "key" VARCHAR(50) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "path" VARCHAR(100) NOT NULL,
    "permission" VARCHAR(50),
    "membersOnly" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(80) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInterest" (
    "userId" UUID NOT NULL,
    "topicId" UUID NOT NULL,

    CONSTRAINT "UserInterest_pkey" PRIMARY KEY ("userId","topicId")
);

-- CreateTable
CREATE TABLE "Community" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'INTEREST',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityMember" (
    "userId" UUID NOT NULL,
    "communityId" UUID NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityMember_pkey" PRIMARY KEY ("userId","communityId")
);

-- CreateTable
CREATE TABLE "Follow" (
    "followerId" UUID NOT NULL,
    "followingId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("followerId","followingId")
);

-- CreateTable
CREATE TABLE "Like" (
    "userId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateTable
CREATE TABLE "Repost" (
    "userId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repost_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "userId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateTable
CREATE TABLE "PostView" (
    "userId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "day" VARCHAR(10) NOT NULL,

    CONSTRAINT "PostView_pkey" PRIMARY KEY ("userId","postId","day")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "excerpt" VARCHAR(400) NOT NULL,
    "body" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "authorId" UUID NOT NULL,
    "sourceUrl" VARCHAR(1000),
    "legacySource" VARCHAR(80),
    "legacyId" VARCHAR(100),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" VARCHAR(20) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "targetId" VARCHAR(100) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_slug_key" ON "Topic"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");

-- CreateIndex
CREATE INDEX "CommunityMember_communityId_idx" ON "CommunityMember"("communityId");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE INDEX "Like_postId_idx" ON "Like"("postId");

-- CreateIndex
CREATE INDEX "Repost_postId_idx" ON "Repost"("postId");

-- CreateIndex
CREATE INDEX "Bookmark_postId_idx" ON "Bookmark"("postId");

-- CreateIndex
CREATE INDEX "PostView_postId_idx" ON "PostView"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE INDEX "Article_status_publishedAt_idx" ON "Article"("status", "publishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Article_legacySource_legacyId_key" ON "Article"("legacySource", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "ActionToken_tokenHash_key" ON "ActionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ActionToken_userId_purpose_idx" ON "ActionToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Post_communityId_createdAt_id_idx" ON "Post"("communityId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Post_topicId_createdAt_id_idx" ON "Post"("topicId", "createdAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInterest" ADD CONSTRAINT "UserInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInterest" ADD CONSTRAINT "UserInterest_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityMember" ADD CONSTRAINT "CommunityMember_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostView" ADD CONSTRAINT "PostView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionToken" ADD CONSTRAINT "ActionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Initial role, navigation, interest and community catalog. No accounts/passwords seeded.
INSERT INTO "Role" ("id","key","name","permissions") VALUES ('8766873a-dfd0-5831-b558-83e9dfa36bff','administrator','Administrator',ARRAY['moderation.manage','users.manage','roles.manage','menus.manage','articles.write','articles.publish','communities.manage','topics.manage']::TEXT[]);
INSERT INTO "Role" ("id","key","name","permissions") VALUES ('4b74c715-0a17-5885-b6f0-ba0fa3bf2cab','moderator','Moderator',ARRAY['moderation.manage']::TEXT[]);
INSERT INTO "Role" ("id","key","name","permissions") VALUES ('31385ddd-ca90-5e31-b7d8-819be6dc1532','editor','Editor',ARRAY['articles.write','articles.publish']::TEXT[]);
INSERT INTO "Role" ("id","key","name","permissions") VALUES ('6050e137-bb39-53cd-9f84-e4cc90881152','member','Member',ARRAY[]::TEXT[]);
INSERT INTO "Menu" ("key","label","path","permission","membersOnly","enabled","position") VALUES ('campus','Campus feed','/',NULL,false,true,0);
INSERT INTO "Menu" ("key","label","path","permission","membersOnly","enabled","position") VALUES ('explore','Explore','/search',NULL,false,true,1);
INSERT INTO "Menu" ("key","label","path","permission","membersOnly","enabled","position") VALUES ('articles','Articles','/articles',NULL,false,true,2);
INSERT INTO "Menu" ("key","label","path","permission","membersOnly","enabled","position") VALUES ('communities','Communities','/communities',NULL,false,true,3);
INSERT INTO "Menu" ("key","label","path","permission","membersOnly","enabled","position") VALUES ('bookmarks','Bookmarks','/bookmarks',NULL,true,true,4);
INSERT INTO "Menu" ("key","label","path","permission","membersOnly","enabled","position") VALUES ('profile','My profile','/me',NULL,true,true,5);
INSERT INTO "Menu" ("key","label","path","permission","membersOnly","enabled","position") VALUES ('settings','Settings','/settings',NULL,true,true,6);
INSERT INTO "Menu" ("key","label","path","permission","membersOnly","enabled","position") VALUES ('editorial','Editorial','/editorial','articles.write',true,true,7);
INSERT INTO "Menu" ("key","label","path","permission","membersOnly","enabled","position") VALUES ('admin','Administration','/admin','moderation.manage',true,true,8);
INSERT INTO "Topic" ("id","slug","name") VALUES ('ffa7f2ee-b86f-5f55-a10a-4f6b212da038','admissions','Admissions');
INSERT INTO "Topic" ("id","slug","name") VALUES ('c59f8720-16cc-5ae5-9ccc-d45bd24002a7','academics','Academics & study');
INSERT INTO "Topic" ("id","slug","name") VALUES ('37f71bf2-ae31-5912-b133-e49f6fc97295','technology','Technology');
INSERT INTO "Topic" ("id","slug","name") VALUES ('7979f2df-936e-55b1-bbbb-2ee280191c75','campus-life','Campus life');
INSERT INTO "Topic" ("id","slug","name") VALUES ('ce7842b9-be5f-5083-ac16-e244758d73cd','opportunities','Jobs & opportunities');
INSERT INTO "Topic" ("id","slug","name") VALUES ('fb12ae0d-6305-56f5-9ce4-aafadc758511','business','Student businesses');
INSERT INTO "Topic" ("id","slug","name") VALUES ('52fb2dfe-45cd-5adc-9acc-d493a1c880eb','sports','Sports');
INSERT INTO "Topic" ("id","slug","name") VALUES ('c0ba17af-9fe9-599f-a9cc-46c376bbf057','arts','Arts & creativity');
INSERT INTO "Community" ("id","slug","name","description","kind") VALUES ('b1984825-d5ac-562c-b217-5b8e7703b14c','computer-engineering','Computer Engineering','Independent community for Computer Engineering. Not an official department channel.','DEPARTMENT');
INSERT INTO "Community" ("id","slug","name","description","kind") VALUES ('c1aacb29-6aa2-55fa-8b06-aeb74c40ef04','accountancy','Accountancy','Independent community for Accountancy. Not an official department channel.','DEPARTMENT');
INSERT INTO "Community" ("id","slug","name","description","kind") VALUES ('b2f7f770-27a2-502d-a9a9-7ad21f689747','aspirants','Aspirants','Independent community for Aspirants. Not an official department channel.','ASPIRANTS');
INSERT INTO "Community" ("id","slug","name","description","kind") VALUES ('e98277e7-cd27-554f-b634-8fd14642fbdd','alumni','Alumni','Independent community for Alumni. Not an official department channel.','ALUMNI');

INSERT INTO "UserRole" ("userId","roleId") SELECT "id", '6050e137-bb39-53cd-9f84-e4cc90881152'::uuid FROM "User" ON CONFLICT DO NOTHING;
