BEGIN;
CREATE FUNCTION fpi_like_notifications() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE recipient UUID;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT "authorId" INTO recipient FROM "Post" WHERE id=NEW."postId";
  PERFORM fpi_notify(recipient,NEW."userId",'LIKE',NEW."postId",NEW."postId",'LIKE:'||NEW."userId"::text||':'||NEW."postId"::text); RETURN NEW;
 ELSE
  DELETE FROM "Notification" WHERE "eventKey"='LIKE:'||OLD."userId"::text||':'||OLD."postId"::text; RETURN OLD;
 END IF;
END $$;
CREATE TRIGGER fpi_like_notifications AFTER INSERT OR DELETE ON "Like" FOR EACH ROW EXECUTE FUNCTION fpi_like_notifications();
COMMIT;
