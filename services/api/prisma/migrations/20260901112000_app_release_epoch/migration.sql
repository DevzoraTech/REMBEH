-- Allow mobile build numbers to restart without deleting old release history.
-- Existing rows stay in release epoch 1. New restarted releases use epoch 2+.
ALTER TABLE "app_releases"
  ADD COLUMN "release_epoch" INTEGER NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS "app_releases_app_name_platform_build_number_key";

CREATE UNIQUE INDEX "app_releases_app_name_platform_release_epoch_build_number_key"
  ON "app_releases"("app_name", "platform", "release_epoch", "build_number");

CREATE INDEX "app_releases_app_name_platform_release_epoch_is_active_idx"
  ON "app_releases"("app_name", "platform", "release_epoch", "is_active");
