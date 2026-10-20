-- Keep original events and their read timestamps; regroup only presentation keys.
CREATE OR REPLACE FUNCTION fpi_notification_group() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE day_key TEXT;
BEGIN
 day_key:=to_char(NEW."createdAt" AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD');
 NEW."groupKey":=CASE WHEN NEW.kind IN ('LIKE','REPOST') THEN NEW.kind::text||':'||NEW."contextPostId"::text||':'||day_key WHEN NEW.kind='FOLLOW' THEN 'FOLLOW:'||day_key WHEN NEW.kind='POST_ALERT' THEN 'POST_ALERT:'||day_key ELSE 'EVENT:'||NEW.id::text END;
 RETURN NEW;
END $$;
UPDATE "Notification" SET "groupKey"='POST_ALERT:'||to_char("createdAt" AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD') WHERE kind='POST_ALERT';

-- A multi-person post takes precedence. Remaining likes by one person share a row.
CREATE FUNCTION fpi_regroup_likes(recipient UUID, day_key TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM "User" WHERE id=recipient FOR UPDATE;
 WITH events AS (
  SELECT id,"actorId","contextPostId" FROM "Notification"
  WHERE "recipientId"=recipient AND kind='LIKE'
   AND "createdAt">=(day_key::date::timestamp AT TIME ZONE 'Africa/Lagos')
   AND "createdAt"<((day_key::date+1)::timestamp AT TIME ZONE 'Africa/Lagos')
 ), counts AS (SELECT "contextPostId",count(DISTINCT "actorId") AS actors FROM events GROUP BY "contextPostId")
 UPDATE "Notification" n SET "groupKey"=CASE WHEN c.actors>1 THEN 'LIKE:POST:'||e."contextPostId"::text ELSE 'LIKE:ACTOR:'||e."actorId"::text END||':'||day_key
 FROM events e JOIN counts c ON c."contextPostId"=e."contextPostId"
 WHERE n.id=e.id;
END $$;
DO $$ DECLARE r RECORD; BEGIN
 FOR r IN SELECT DISTINCT "recipientId",to_char("createdAt" AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD') AS day FROM "Notification" WHERE kind='LIKE'
 LOOP PERFORM fpi_regroup_likes(r."recipientId",r.day); END LOOP;
END $$;
CREATE FUNCTION fpi_like_groups_changed() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.kind='LIKE' THEN PERFORM fpi_regroup_likes(OLD."recipientId",to_char(OLD."createdAt" AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD')); END IF;
  RETURN OLD;
 END IF;
 IF NEW.kind='LIKE' THEN PERFORM fpi_regroup_likes(NEW."recipientId",to_char(NEW."createdAt" AT TIME ZONE 'Africa/Lagos','YYYY-MM-DD')); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fpi_like_groups_changed AFTER INSERT OR DELETE ON "Notification" FOR EACH ROW EXECUTE FUNCTION fpi_like_groups_changed();
