BEGIN;
CREATE TYPE "NotificationKind" AS ENUM ('REPLY','FOLLOW','REPOST','QUOTE');
CREATE TABLE "Notification" (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "eventKey" VARCHAR(160) NOT NULL UNIQUE,
 "recipientId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "actorId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 kind "NotificationKind" NOT NULL,
 "postId" UUID REFERENCES "Post"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "contextPostId" UUID REFERENCES "Post"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "readAt" TIMESTAMPTZ(3),
 CHECK ("recipientId" <> "actorId"),
 CHECK ((kind='FOLLOW' AND "postId" IS NULL AND "contextPostId" IS NULL) OR (kind<>'FOLLOW' AND "postId" IS NOT NULL AND "contextPostId" IS NOT NULL))
);
CREATE INDEX "Notification_recipientId_createdAt_id_idx" ON "Notification"("recipientId","createdAt" DESC,id DESC);
CREATE INDEX "Notification_recipientId_readAt_idx" ON "Notification"("recipientId","readAt");
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");
CREATE INDEX "Notification_postId_idx" ON "Notification"("postId");
CREATE INDEX "Notification_contextPostId_idx" ON "Notification"("contextPostId");
-- Events are inserted in the same transaction as their source interaction.
-- Existing activity is deliberately not backfilled into members' inboxes.
CREATE FUNCTION fpi_notify(recipient UUID, actor UUID, event_kind "NotificationKind", source_post UUID, context_post UUID, event_key TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 IF recipient IS NULL OR recipient=actor THEN RETURN; END IF;
 IF NOT EXISTS (SELECT 1 FROM "User" WHERE id=recipient AND status='ACTIVE') OR NOT EXISTS (SELECT 1 FROM "User" WHERE id=actor AND status='ACTIVE') THEN RETURN; END IF;
 IF EXISTS (SELECT 1 FROM "Block" WHERE ("blockerId"=recipient AND "blockedId"=actor) OR ("blockerId"=actor AND "blockedId"=recipient)) OR EXISTS (SELECT 1 FROM "Mute" WHERE "muterId"=recipient AND "mutedId"=actor) THEN RETURN; END IF;
 INSERT INTO "Notification" ("recipientId","actorId",kind,"postId","contextPostId","eventKey") VALUES (recipient,actor,event_kind,source_post,context_post,event_key) ON CONFLICT ("eventKey") DO NOTHING;
END $$;
CREATE FUNCTION fpi_post_notifications() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE recipient UUID; reply_recipient UUID;
BEGIN
 IF NEW."parentId" IS NOT NULL THEN
  SELECT "authorId" INTO recipient FROM "Post" WHERE id=NEW."parentId";
  reply_recipient:=recipient;
  PERFORM fpi_notify(recipient,NEW."authorId",'REPLY',NEW.id,NEW."parentId",'REPLY:'||NEW.id::text);
 END IF;
 IF NEW."quotedPostId" IS NOT NULL THEN
  SELECT "authorId" INTO recipient FROM "Post" WHERE id=NEW."quotedPostId";
  IF recipient IS DISTINCT FROM reply_recipient THEN
   PERFORM fpi_notify(recipient,NEW."authorId",'QUOTE',NEW.id,NEW."quotedPostId",'QUOTE:'||NEW.id::text);
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fpi_post_notifications AFTER INSERT ON "Post" FOR EACH ROW EXECUTE FUNCTION fpi_post_notifications();
CREATE FUNCTION fpi_follow_notifications() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM fpi_notify(NEW."followingId",NEW."followerId",'FOLLOW',NULL,NULL,'FOLLOW:'||NEW."followerId"::text||':'||NEW."followingId"::text); RETURN NEW;
 ELSE
  DELETE FROM "Notification" WHERE "eventKey"='FOLLOW:'||OLD."followerId"::text||':'||OLD."followingId"::text; RETURN OLD;
 END IF;
END $$;
CREATE TRIGGER fpi_follow_notifications AFTER INSERT OR DELETE ON "Follow" FOR EACH ROW EXECUTE FUNCTION fpi_follow_notifications();
CREATE FUNCTION fpi_repost_notifications() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE recipient UUID;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT "authorId" INTO recipient FROM "Post" WHERE id=NEW."postId";
  PERFORM fpi_notify(recipient,NEW."userId",'REPOST',NEW."postId",NEW."postId",'REPOST:'||NEW."userId"::text||':'||NEW."postId"::text); RETURN NEW;
 ELSE
  DELETE FROM "Notification" WHERE "eventKey"='REPOST:'||OLD."userId"::text||':'||OLD."postId"::text; RETURN OLD;
 END IF;
END $$;
CREATE TRIGGER fpi_repost_notifications AFTER INSERT OR DELETE ON "Repost" FOR EACH ROW EXECUTE FUNCTION fpi_repost_notifications();
INSERT INTO "Menu" (key,label,path,"membersOnly",enabled,position) VALUES ('notifications','Notifications','/notifications',true,true,3) ON CONFLICT DO NOTHING;
COMMIT;
