BEGIN;
CREATE TABLE "PostToken" (
 "postId" UUID NOT NULL REFERENCES "Post"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 start INTEGER NOT NULL, "end" INTEGER NOT NULL, label VARCHAR(66) NOT NULL,
 kind VARCHAR(10) NOT NULL, hashtag VARCHAR(64),
 "userId" UUID REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE,
 PRIMARY KEY ("postId",start),
 CHECK (start>=0 AND "end">start),
 CHECK ((kind='MENTION' AND hashtag IS NULL) OR (kind='HASHTAG' AND hashtag IS NOT NULL AND "userId" IS NULL))
);
CREATE INDEX "PostToken_hashtag_postId_idx" ON "PostToken"(hashtag,"postId");
CREATE INDEX "PostToken_userId_idx" ON "PostToken"("userId");
CREATE FUNCTION fpi_mention_notification() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE actor UUID;
BEGIN
 IF NEW.kind<>'MENTION' OR NEW."userId" IS NULL THEN RETURN NEW; END IF;
 SELECT "authorId" INTO actor FROM "Post" WHERE id=NEW."postId";
 -- Reply/quote events already exist when nested token rows are inserted.
 IF NOT EXISTS (SELECT 1 FROM "Notification" WHERE "postId"=NEW."postId" AND "recipientId"=NEW."userId" AND kind IN ('REPLY','QUOTE')) THEN
  PERFORM fpi_notify(NEW."userId",actor,'MENTION',NEW."postId",NEW."postId",'MENTION:'||NEW."postId"::text||':'||NEW."userId"::text);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fpi_mention_notification AFTER INSERT ON "PostToken" FOR EACH ROW EXECUTE FUNCTION fpi_mention_notification();
COMMIT;
