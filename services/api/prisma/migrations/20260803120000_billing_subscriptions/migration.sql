-- CreateEnum
CREATE TYPE "SubscriptionInterval" AS ENUM ('MONTHLY');

-- CreateEnum
CREATE TYPE "BranchSubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'GRACE', 'PAST_DUE', 'LOCKED');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED');

-- CreateTable
CREATE TABLE "tenant_billing" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trial_starts_at" TIMESTAMP(3) NOT NULL,
    "trial_ends_at" TIMESTAMP(3) NOT NULL,
    "pesapal_customer_hint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_billing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "interval" "SubscriptionInterval" NOT NULL DEFAULT 'MONTHLY',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "BranchSubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "grace_ends_at" TIMESTAMP(3),
    "locked_at" TIMESTAMP(3),
    "last_reminder_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "merchant_reference" TEXT NOT NULL,
    "order_tracking_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "raw_payload" JSONB,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_billing_tenant_id_key" ON "tenant_billing"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_billing_trial_ends_at_idx" ON "tenant_billing"("trial_ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "branch_subscriptions_branch_id_key" ON "branch_subscriptions"("branch_id");

-- CreateIndex
CREATE INDEX "branch_subscriptions_tenant_id_status_idx" ON "branch_subscriptions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "branch_subscriptions_status_grace_ends_at_idx" ON "branch_subscriptions"("status", "grace_ends_at");

-- CreateIndex
CREATE INDEX "branch_subscriptions_status_current_period_end_idx" ON "branch_subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_merchant_reference_key" ON "subscription_payments"("merchant_reference");

-- CreateIndex
CREATE INDEX "subscription_payments_tenant_id_branch_id_status_idx" ON "subscription_payments"("tenant_id", "branch_id", "status");

-- CreateIndex
CREATE INDEX "subscription_payments_order_tracking_id_idx" ON "subscription_payments"("order_tracking_id");

-- AddForeignKey
ALTER TABLE "tenant_billing" ADD CONSTRAINT "tenant_billing_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_subscriptions" ADD CONSTRAINT "branch_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_subscriptions" ADD CONSTRAINT "branch_subscriptions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_subscriptions" ADD CONSTRAINT "branch_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed Pro plan
INSERT INTO "subscription_plans" ("id", "code", "name", "amount", "currency", "interval", "is_active", "created_at", "updated_at")
VALUES (
  gen_random_uuid(),
  'PRO',
  'Pro',
  150000,
  'UGX',
  'MONTHLY',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
