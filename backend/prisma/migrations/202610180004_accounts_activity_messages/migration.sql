-- AlterTable
ALTER TABLE "User" ADD COLUMN     "messagePolicy" VARCHAR(12) NOT NULL DEFAULT 'REQUESTS',
ADD COLUMN     "passwordEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Follow" ADD COLUMN     "postAlerts" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "activityKind" VARCHAR(10),
ADD COLUMN     "groupKey" VARCHAR(200) NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "OAuthIdentity" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthChallenge" (
    "id" UUID NOT NULL,
    "stateHash" CHAR(64) NOT NULL,
    "verifier" VARCHAR(128) NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "next" VARCHAR(500) NOT NULL,
    "linkUserId" UUID,
    "linkSessionId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthEnrollment" (
    "id" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,
    "next" VARCHAR(500) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" UUID NOT NULL,
    "lowId" UUID NOT NULL,
    "highId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "declinedAt" TIMESTAMPTZ(3),
    "lowReadAt" TIMESTAMPTZ(3) NOT NULL DEFAULT '1970-01-01'::timestamptz,
    "highReadAt" TIMESTAMPTZ(3) NOT NULL DEFAULT '1970-01-01'::timestamptz,
    "lowReadId" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    "highReadId" UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatReport" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" VARCHAR(2000) NOT NULL,
    "snapshot" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'OPEN',
    "reviewNote" VARCHAR(2000),
    "reviewerId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthIdentity_provider_subject_key" ON "OAuthIdentity"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthIdentity_userId_provider_key" ON "OAuthIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthChallenge_stateHash_key" ON "OAuthChallenge"("stateHash");

-- CreateIndex
CREATE INDEX "OAuthChallenge_expiresAt_idx" ON "OAuthChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthEnrollment_tokenHash_key" ON "OAuthEnrollment"("tokenHash");

-- CreateIndex
CREATE INDEX "OAuthEnrollment_expiresAt_idx" ON "OAuthEnrollment"("expiresAt");

-- CreateIndex
CREATE INDEX "ChatConversation_lowId_updatedAt_id_idx" ON "ChatConversation"("lowId", "updatedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ChatConversation_highId_updatedAt_id_idx" ON "ChatConversation"("highId", "updatedAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_lowId_highId_key" ON "ChatConversation"("lowId", "highId");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_id_idx" ON "ChatMessage"("conversationId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_senderId_requestId_key" ON "ChatMessage"("senderId", "requestId");

-- CreateIndex
CREATE INDEX "ChatReport_status_createdAt_idx" ON "ChatReport"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ChatReport_reporterId_messageId_key" ON "ChatReport"("reporterId", "messageId");

-- CreateIndex
CREATE INDEX "Notification_recipientId_groupKey_createdAt_idx" ON "Notification"("recipientId", "groupKey", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "OAuthIdentity" ADD CONSTRAINT "OAuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_lowId_fkey" FOREIGN KEY ("lowId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_highId_fkey" FOREIGN KEY ("highId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReport" ADD CONSTRAINT "ChatReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReport" ADD CONSTRAINT "ChatReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReport" ADD CONSTRAINT "ChatReport_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Group only compatible activity. Reply/quote/mention destinations stay individual.
CREATE FUNCTION fpi_notification_group() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE day_key TEXT;
BEGIN
 day_key:=to_char(NEW."createdAt" AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD');
 NEW."groupKey":=CASE WHEN NEW.kind IN ('LIKE','REPOST') THEN NEW.kind::text||':'||NEW."contextPostId"::text||':'||day_key WHEN NEW.kind='FOLLOW' THEN 'FOLLOW:'||day_key WHEN NEW.kind='POST_ALERT' THEN 'POST_ALERT:'||NEW."actorId"::text||':'||day_key ELSE 'EVENT:'||NEW.id::text END;
 RETURN NEW;
END $$;
CREATE TRIGGER fpi_notification_group BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION fpi_notification_group();
UPDATE "Notification" SET "groupKey"=CASE WHEN kind IN ('LIKE','REPOST') THEN kind::text||':'||"contextPostId"::text||':'||to_char("createdAt" AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD') WHEN kind='FOLLOW' THEN 'FOLLOW:'||to_char("createdAt" AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD') ELSE 'EVENT:'||id::text END;
CREATE FUNCTION fpi_profile_alerts() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE f RECORD; p RECORD;
BEGIN
 IF TG_OP='DELETE' THEN DELETE FROM "Notification" WHERE "eventKey" LIKE 'POST_ALERT:'||OLD.id::text||':%';RETURN OLD;END IF;
 SELECT * INTO p FROM "Post" WHERE id=NEW."postId";
 IF p.status<>'PUBLISHED' OR p."deletedAt" IS NOT NULL THEN RETURN NEW;END IF;
 FOR f IN SELECT "followerId" FROM "Follow" WHERE "followingId"=NEW."actorId" AND "postAlerts"=true LOOP
  PERFORM fpi_notify(f."followerId",NEW."actorId",'POST_ALERT',NEW."postId",NEW."postId",'POST_ALERT:'||NEW.id::text||':'||f."followerId"::text);
  UPDATE "Notification" SET "activityKind"=NEW.kind WHERE "eventKey"='POST_ALERT:'||NEW.id::text||':'||f."followerId"::text;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER fpi_profile_alerts AFTER INSERT OR DELETE ON "FeedEvent" FOR EACH ROW EXECUTE FUNCTION fpi_profile_alerts();
INSERT INTO "Menu"(key,label,path,"membersOnly",enabled,position) VALUES('messages','Messages','/messages',true,true,4) ON CONFLICT DO NOTHING;

ALTER TABLE "ChatConversation" ADD CONSTRAINT "chat_distinct_ordered_pair" CHECK ("lowId"<"highId" AND "requesterId" IN ("lowId","highId"));

ALTER TABLE "OAuthEnrollment" ADD COLUMN "trustedEmail" BOOLEAN NOT NULL DEFAULT false;
