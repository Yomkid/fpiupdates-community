-- Preserve existing holds and accounts; never seize an already occupied name.
INSERT INTO "UsernameHold" ("username", "ownerId", "reason", "redirect", "expiresAt")
SELECT seed.name, u.id, 'Initial protected platform name', false, NULL
FROM (VALUES ('admin'), ('administrator'), ('support'), ('security'), ('moderator'),
             ('official'), ('fpiupdates'), ('fpi_updates')) AS seed(name)
LEFT JOIN "User" u ON u."username" = seed.name
ON CONFLICT ("username") DO NOTHING;
