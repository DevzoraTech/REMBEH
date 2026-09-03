-- AlterTable
ALTER TABLE "tenant_sms_notification_settings"
ADD COLUMN "support_contact_source" TEXT NOT NULL DEFAULT 'MANAGER',
ADD COLUMN "support_contact_locked" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "SmsSupportContactSource" AS ENUM ('OWNER', 'MANAGER');

-- Convert text default to enum
ALTER TABLE "tenant_sms_notification_settings"
ALTER COLUMN "support_contact_source" DROP DEFAULT;

ALTER TABLE "tenant_sms_notification_settings"
ALTER COLUMN "support_contact_source" TYPE "SmsSupportContactSource"
USING "support_contact_source"::"SmsSupportContactSource";

ALTER TABLE "tenant_sms_notification_settings"
ALTER COLUMN "support_contact_source" SET DEFAULT 'MANAGER';
