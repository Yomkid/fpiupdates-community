ALTER TABLE "Community" ADD COLUMN "logoMediaId" UUID;
ALTER TABLE "Community" ADD CONSTRAINT "Community_logoMediaId_fkey" FOREIGN KEY ("logoMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
