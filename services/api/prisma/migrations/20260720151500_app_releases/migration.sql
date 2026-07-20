-- CreateTable
CREATE TABLE "app_releases" (
    "id" UUID NOT NULL,
    "app_name" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "version" TEXT NOT NULL,
    "build_number" INTEGER NOT NULL,
    "update_mode" TEXT NOT NULL,
    "force_update" BOOLEAN NOT NULL DEFAULT false,
    "min_supported_build" INTEGER NOT NULL DEFAULT 1,
    "apk_url" TEXT,
    "apk_hash" TEXT,
    "changelog" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "message" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_releases_app_name_platform_is_active_idx" ON "app_releases"("app_name", "platform", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "app_releases_app_name_platform_build_number_key" ON "app_releases"("app_name", "platform", "build_number");
