ALTER TABLE "User" ADD COLUMN "discoverByEmail" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "discoverByPhone" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
ALTER TABLE "DiscoveryCard" ADD COLUMN sidebar BOOLEAN NOT NULL DEFAULT true, ADD COLUMN feed BOOLEAN NOT NULL DEFAULT false, ADD COLUMN desktop BOOLEAN NOT NULL DEFAULT true, ADD COLUMN mobile BOOLEAN NOT NULL DEFAULT true;
-- Preserve existing feed announcements. New cards start as sidebar-only until selected.
UPDATE "DiscoveryCard" SET feed=true WHERE kind='ANNOUNCEMENT';
ALTER TABLE "SportsTeam" ADD COLUMN "logoMediaId" UUID REFERENCES "Media"(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SportsMatch" ADD COLUMN "featuredSidebar" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "featuredFeed" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "featuredDesktop" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "featuredMobile" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "SportsPlayer" (
 id UUID PRIMARY KEY, "teamId" UUID NOT NULL REFERENCES "SportsTeam"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 name VARCHAR(80) NOT NULL, "shirtNumber" INTEGER,
 "userId" UUID REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE,
 "photoMediaId" UUID REFERENCES "Media"(id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SportsPlayer_teamId_shirtNumber_key" ON "SportsPlayer"("teamId","shirtNumber");
CREATE INDEX "SportsPlayer_userId_idx" ON "SportsPlayer"("userId");
CREATE TABLE "SportsGoal" (
 id UUID PRIMARY KEY, "matchId" UUID NOT NULL REFERENCES "SportsMatch"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "teamId" UUID NOT NULL REFERENCES "SportsTeam"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "playerId" UUID REFERENCES "SportsPlayer"(id) ON DELETE SET NULL ON UPDATE CASCADE,
 "scorerName" VARCHAR(80), minute INTEGER NOT NULL, kind VARCHAR(12) NOT NULL, note VARCHAR(500) NOT NULL,
 "requestId" UUID NOT NULL, voided BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SportsGoal_matchId_requestId_key" ON "SportsGoal"("matchId","requestId");
CREATE INDEX "SportsGoal_matchId_minute_id_idx" ON "SportsGoal"("matchId",minute,id);
INSERT INTO "Menu"(key,label,path,"membersOnly",enabled,position) VALUES('follow','Follow','/people',true,true,4) ON CONFLICT(key) DO NOTHING;
