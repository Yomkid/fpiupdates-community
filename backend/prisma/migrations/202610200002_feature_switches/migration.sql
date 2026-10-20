CREATE TABLE "FeatureSwitch" (key VARCHAR(40) PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT true);
UPDATE "Role" SET permissions=array_append(permissions,'features.manage') WHERE key='administrator' AND NOT ('features.manage'=ANY(permissions));
