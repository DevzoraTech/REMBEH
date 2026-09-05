-- AlterTable
ALTER TABLE "tenant_sms_notification_settings"
ADD COLUMN "support_phone" TEXT;

-- Default support contact to the organisation owner going forward.
ALTER TABLE "tenant_sms_notification_settings"
ALTER COLUMN "support_contact_source" SET DEFAULT 'OWNER';

UPDATE "tenant_sms_notification_settings"
SET "support_contact_source" = 'OWNER'
WHERE "support_contact_source" = 'MANAGER'
  AND "support_contact_locked" = false;
