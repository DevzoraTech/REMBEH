-- CreateEnum
CREATE TYPE "ControlCenterAdminStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ControlCenterMessageChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "ControlCenterMessageStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "control_center_admins" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT,
    "status" "ControlCenterAdminStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_center_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_price_overrides" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "plan_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_until" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "changed_by_admin_id" UUID NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_price_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_center_message_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "ControlCenterMessageChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_center_message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_center_message_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "branch_id" UUID,
    "created_by_admin_id" UUID NOT NULL,
    "channel" "ControlCenterMessageChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "ControlCenterMessageStatus" NOT NULL,
    "provider" TEXT,
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_center_message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_center_audit_logs" (
    "id" UUID NOT NULL,
    "admin_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_center_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "control_center_admins_email_key" ON "control_center_admins"("email");

-- CreateIndex
CREATE INDEX "subscription_price_overrides_tenant_id_branch_id_plan_id_effective_from_idx" ON "subscription_price_overrides"("tenant_id", "branch_id", "plan_id", "effective_from");

-- CreateIndex
CREATE INDEX "subscription_price_overrides_tenant_id_branch_id_revoked_at_idx" ON "subscription_price_overrides"("tenant_id", "branch_id", "revoked_at");

-- CreateIndex
CREATE INDEX "subscription_price_overrides_plan_id_idx" ON "subscription_price_overrides"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "control_center_message_templates_code_key" ON "control_center_message_templates"("code");

-- CreateIndex
CREATE INDEX "control_center_message_templates_channel_idx" ON "control_center_message_templates"("channel");

-- CreateIndex
CREATE INDEX "control_center_message_logs_created_by_admin_id_created_at_idx" ON "control_center_message_logs"("created_by_admin_id", "created_at");

-- CreateIndex
CREATE INDEX "control_center_message_logs_tenant_id_created_at_idx" ON "control_center_message_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "control_center_message_logs_channel_status_created_at_idx" ON "control_center_message_logs"("channel", "status", "created_at");

-- CreateIndex
CREATE INDEX "control_center_audit_logs_admin_id_created_at_idx" ON "control_center_audit_logs"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "control_center_audit_logs_entity_type_entity_id_idx" ON "control_center_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "control_center_audit_logs_action_created_at_idx" ON "control_center_audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "subscription_price_overrides" ADD CONSTRAINT "subscription_price_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_price_overrides" ADD CONSTRAINT "subscription_price_overrides_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_price_overrides" ADD CONSTRAINT "subscription_price_overrides_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_price_overrides" ADD CONSTRAINT "subscription_price_overrides_changed_by_admin_id_fkey" FOREIGN KEY ("changed_by_admin_id") REFERENCES "control_center_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_center_message_logs" ADD CONSTRAINT "control_center_message_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_center_message_logs" ADD CONSTRAINT "control_center_message_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_center_message_logs" ADD CONSTRAINT "control_center_message_logs_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "control_center_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_center_audit_logs" ADD CONSTRAINT "control_center_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "control_center_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
