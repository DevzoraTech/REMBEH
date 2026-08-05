-- CreateTable
CREATE TABLE "tenant_sms_notification_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "loan_recorded_enabled" BOOLEAN NOT NULL DEFAULT true,
    "payment_confirmation_enabled" BOOLEAN NOT NULL DEFAULT true,
    "payment_reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "overdue_notice_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_sms_notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_sms_notification_settings_tenant_id_key" ON "tenant_sms_notification_settings"("tenant_id");

-- AddForeignKey
ALTER TABLE "tenant_sms_notification_settings" ADD CONSTRAINT "tenant_sms_notification_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_sms_notification_settings" ADD CONSTRAINT "tenant_sms_notification_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
