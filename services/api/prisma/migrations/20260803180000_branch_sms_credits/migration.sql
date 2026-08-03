-- Branch prepaid SMS wallets (message credits), top-ups, and usage audit.

CREATE TABLE "branch_sms_wallets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "credits_remaining" INTEGER NOT NULL DEFAULT 0,
    "lifetime_purchased" INTEGER NOT NULL DEFAULT 0,
    "lifetime_used" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_sms_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branch_sms_wallets_branch_id_key" ON "branch_sms_wallets"("branch_id");
CREATE INDEX "branch_sms_wallets_tenant_id_idx" ON "branch_sms_wallets"("tenant_id");

ALTER TABLE "branch_sms_wallets" ADD CONSTRAINT "branch_sms_wallets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_sms_wallets" ADD CONSTRAINT "branch_sms_wallets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sms_credit_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "merchant_reference" TEXT NOT NULL,
    "order_tracking_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "credits" INTEGER NOT NULL,
    "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "raw_payload" JSONB,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_credit_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sms_credit_payments_merchant_reference_key" ON "sms_credit_payments"("merchant_reference");
CREATE INDEX "sms_credit_payments_tenant_id_branch_id_status_idx" ON "sms_credit_payments"("tenant_id", "branch_id", "status");
CREATE INDEX "sms_credit_payments_order_tracking_id_idx" ON "sms_credit_payments"("order_tracking_id");

ALTER TABLE "sms_credit_payments" ADD CONSTRAINT "sms_credit_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_credit_payments" ADD CONSTRAINT "sms_credit_payments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_credit_payments" ADD CONSTRAINT "sms_credit_payments_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "branch_sms_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sms_usage_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "body_preview" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sms_usage_logs_tenant_id_branch_id_created_at_idx" ON "sms_usage_logs"("tenant_id", "branch_id", "created_at");

ALTER TABLE "sms_usage_logs" ADD CONSTRAINT "sms_usage_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_usage_logs" ADD CONSTRAINT "sms_usage_logs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_usage_logs" ADD CONSTRAINT "sms_usage_logs_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "branch_sms_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
