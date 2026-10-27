CREATE TABLE "LaunchControl" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "mode" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "launchAt" TIMESTAMPTZ(3) NOT NULL DEFAULT '2026-10-30 17:00:00+00',
    "title" VARCHAR(160) NOT NULL DEFAULT 'A place for our community to come together.',
    "message" VARCHAR(500) NOT NULL DEFAULT 'Discover conversations, campus updates and opportunities. FpiUpdates starts in Ilaro, and everyone is welcome.',
    "allowedPages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "allowedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LaunchControl_pkey" PRIMARY KEY ("id")
);
INSERT INTO "LaunchControl" ("id") VALUES ('platform');
