CREATE TABLE "ArticleWorkingCopy" (
 "id" UUID PRIMARY KEY, "authorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "payload" JSONB NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
 "publishedVersion" INTEGER NOT NULL DEFAULT 0,
 "scheduledAt" TIMESTAMPTZ(3), "scheduledById" UUID REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "scheduleError" VARCHAR(300), "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "working_version_positive" CHECK ("version">0)
);
CREATE INDEX "ArticleWorkingCopy_scheduledAt_idx" ON "ArticleWorkingCopy"("scheduledAt");
CREATE INDEX "ArticleWorkingCopy_authorId_idx" ON "ArticleWorkingCopy"("authorId");
