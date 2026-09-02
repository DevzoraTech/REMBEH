-- Control Center owns the in-app force-update screen copy and promo media.
CREATE TYPE "AppUpdateMediaType" AS ENUM ('NONE', 'IMAGE', 'VIDEO');

CREATE TABLE "app_update_screen_content" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'mobile',
    "ready_message" TEXT,
    "required_message" TEXT,
    "whats_new_title" TEXT NOT NULL DEFAULT 'What''s new in this update',
    "whats_new_items" JSONB NOT NULL DEFAULT '[]',
    "media_type" "AppUpdateMediaType" NOT NULL DEFAULT 'NONE',
    "media_url" TEXT,
    "media_storage_key" TEXT,
    "media_title" TEXT,
    "media_body" TEXT,
    "media_cta_label" TEXT,
    "stay_connected_title" TEXT,
    "stay_connected_body" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_update_screen_content_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_update_screen_content_key_key" ON "app_update_screen_content"("key");
