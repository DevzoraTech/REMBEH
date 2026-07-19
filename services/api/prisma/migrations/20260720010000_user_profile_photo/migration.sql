-- AlterTable: agent professional selfie on user profile
ALTER TABLE "users" ADD COLUMN "profile_photo_storage_key" TEXT;
ALTER TABLE "users" ADD COLUMN "profile_photo_mime_type" TEXT;
ALTER TABLE "users" ADD COLUMN "profile_photo_updated_at" TIMESTAMP(3);
