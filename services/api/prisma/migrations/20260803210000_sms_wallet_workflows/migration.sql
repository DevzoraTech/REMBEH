-- SMS wallet workflows: available/reserved, bundles, purchases, ledger, messages, callbacks

-- Enums
CREATE TYPE "SmsBundleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "SmsPurchaseStatus" AS ENUM (
  'PAYMENT_PENDING',
  'AWAITING_PAYMENT',
  'PAYMENT_CONFIRMED',
  'CREDIT_PROCESSING',
  'CREDITED',
  'PAYMENT_FAILED',
  'CANCELLED_BY_USER',
  'PAYMENT_MISMATCH',
  'MANUAL_REVIEW',
  'EXPIRED',
  'REFUNDED',
  'REVERSED'
);
CREATE TYPE "SmsWalletLedgerEntryType" AS ENUM (
  'BUNDLE_PURCHASE',
  'GRANT',
  'RESERVE',
  'RELEASE',
  'DEBIT_CONFIRMED',
  'ADJUSTMENT',
  'REFUND'
);
CREATE TYPE "SmsWalletLedgerDirection" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "SmsMessageStatus" AS ENUM (
  'PENDING_VALIDATION',
  'RESERVED',
  'SENT',
  'FAILED_VALIDATION',
  'FAILED_INSUFFICIENT_CREDITS',
  'BLOCKED_PROVIDER_UNAVAILABLE',
  'PROVIDER_FAILED',
  'RELEASED'
);
CREATE TYPE "SmsCallbackProcessingStatus" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'IGNORED',
  'FAILED'
);

-- Wallet: rename balance + add reserved/version/status
ALTER TABLE "branch_sms_wallets"
  RENAME COLUMN "credits_remaining" TO "available_units";

ALTER TABLE "branch_sms_wallets"
  ADD COLUMN "reserved_units" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- Bundle catalogue
CREATE TABLE "sms_bundles" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "price_ugx" INTEGER NOT NULL,
  "sms_units" INTEGER NOT NULL,
  "effective_rate" DECIMAL(12,4) NOT NULL,
  "status" "SmsBundleStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "active_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "active_to" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sms_bundles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sms_bundles_code_key" ON "sms_bundles"("code");
CREATE INDEX "sms_bundles_status_active_from_idx" ON "sms_bundles"("status", "active_from");

-- Purchases
CREATE TABLE "sms_purchases" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "bundle_id" UUID NOT NULL,
  "bundle_version" INTEGER NOT NULL,
  "bundle_name_snapshot" TEXT NOT NULL,
  "initiated_by_user_id" UUID NOT NULL,
  "amount_expected" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'UGX',
  "sms_units_expected" INTEGER NOT NULL,
  "merchant_reference" TEXT NOT NULL,
  "pesapal_order_tracking_id" TEXT,
  "external_transaction_id" TEXT,
  "status" "SmsPurchaseStatus" NOT NULL DEFAULT 'PAYMENT_PENDING',
  "raw_payload" JSONB,
  "credited_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sms_purchases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sms_purchases_merchant_reference_key" ON "sms_purchases"("merchant_reference");
CREATE UNIQUE INDEX "sms_purchases_external_transaction_id_key" ON "sms_purchases"("external_transaction_id");
CREATE INDEX "sms_purchases_tenant_id_branch_id_status_idx" ON "sms_purchases"("tenant_id", "branch_id", "status");
CREATE INDEX "sms_purchases_pesapal_order_tracking_id_idx" ON "sms_purchases"("pesapal_order_tracking_id");
CREATE INDEX "sms_purchases_branch_bundle_user_status_created_idx"
  ON "sms_purchases"("branch_id", "bundle_id", "initiated_by_user_id", "status", "created_at");

ALTER TABLE "sms_purchases"
  ADD CONSTRAINT "sms_purchases_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_purchases"
  ADD CONSTRAINT "sms_purchases_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_purchases"
  ADD CONSTRAINT "sms_purchases_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "branch_sms_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_purchases"
  ADD CONSTRAINT "sms_purchases_bundle_id_fkey"
  FOREIGN KEY ("bundle_id") REFERENCES "sms_bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ledger
CREATE TABLE "sms_wallet_ledger" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "entry_type" "SmsWalletLedgerEntryType" NOT NULL,
  "direction" "SmsWalletLedgerDirection" NOT NULL,
  "units" INTEGER NOT NULL,
  "balance_before" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "reference_type" TEXT NOT NULL,
  "reference_id" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sms_wallet_ledger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sms_wallet_ledger_tenant_id_branch_id_created_at_idx"
  ON "sms_wallet_ledger"("tenant_id", "branch_id", "created_at");
CREATE INDEX "sms_wallet_ledger_wallet_id_created_at_idx"
  ON "sms_wallet_ledger"("wallet_id", "created_at");
CREATE INDEX "sms_wallet_ledger_reference_type_reference_id_idx"
  ON "sms_wallet_ledger"("reference_type", "reference_id");

-- Idempotent Pro welcome grants (one per branch)
CREATE UNIQUE INDEX "sms_wallet_ledger_welcome_grant_uidx"
  ON "sms_wallet_ledger"("branch_id", "reference_type", "reference_id")
  WHERE "entry_type" = 'GRANT' AND "reference_type" = 'pro_welcome_grant';

ALTER TABLE "sms_wallet_ledger"
  ADD CONSTRAINT "sms_wallet_ledger_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_wallet_ledger"
  ADD CONSTRAINT "sms_wallet_ledger_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_wallet_ledger"
  ADD CONSTRAINT "sms_wallet_ledger_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "branch_sms_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Callback events
CREATE TABLE "sms_callback_events" (
  "id" UUID NOT NULL,
  "tenant_id" UUID,
  "provider" TEXT NOT NULL DEFAULT 'pesapal',
  "external_transaction_id" TEXT,
  "merchant_reference" TEXT,
  "payload_hash" TEXT NOT NULL,
  "raw_payload" JSONB NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processing_status" "SmsCallbackProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  CONSTRAINT "sms_callback_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sms_callback_events_merchant_reference_idx" ON "sms_callback_events"("merchant_reference");
CREATE INDEX "sms_callback_events_external_transaction_id_idx" ON "sms_callback_events"("external_transaction_id");
CREATE INDEX "sms_callback_events_received_at_idx" ON "sms_callback_events"("received_at");
ALTER TABLE "sms_callback_events"
  ADD CONSTRAINT "sms_callback_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Messages
CREATE TABLE "sms_messages" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "wallet_id" UUID NOT NULL,
  "recipient_id" TEXT,
  "recipient_phone" TEXT NOT NULL,
  "message_type" TEXT NOT NULL,
  "message_body" TEXT NOT NULL,
  "trigger_source" TEXT NOT NULL,
  "trigger_reference_id" TEXT,
  "requested_by_user_id" UUID,
  "status" "SmsMessageStatus" NOT NULL DEFAULT 'PENDING_VALIDATION',
  "encoding_type" TEXT,
  "character_count" INTEGER,
  "segments_required" INTEGER,
  "idempotency_key" TEXT,
  "provider_message_id" TEXT,
  "failure_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "sent_at" TIMESTAMP(3),
  CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sms_messages_idempotency_key_key" ON "sms_messages"("idempotency_key");
CREATE INDEX "sms_messages_tenant_id_branch_id_created_at_idx"
  ON "sms_messages"("tenant_id", "branch_id", "created_at");
CREATE INDEX "sms_messages_status_created_at_idx" ON "sms_messages"("status", "created_at");

ALTER TABLE "sms_messages"
  ADD CONSTRAINT "sms_messages_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_messages"
  ADD CONSTRAINT "sms_messages_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sms_messages"
  ADD CONSTRAINT "sms_messages_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "branch_sms_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed bundles (UGX 45 effective rate examples from product spec)
INSERT INTO "sms_bundles" (
  "id", "code", "name", "price_ugx", "sms_units", "effective_rate",
  "status", "version", "active_from", "active_to", "created_at", "updated_at"
) VALUES
  (
    gen_random_uuid(),
    'standard_10k',
    'Standard 1',
    10000,
    222,
    45.0450,
    'ACTIVE',
    1,
    CURRENT_TIMESTAMP,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'standard_20k',
    'Standard 2',
    20000,
    444,
    45.0450,
    'ACTIVE',
    1,
    CURRENT_TIMESTAMP,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'standard_50k',
    'Standard 3',
    50000,
    1111,
    45.0045,
    'ACTIVE',
    1,
    CURRENT_TIMESTAMP,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

-- Opening ledger rows for existing wallets (audit continuity)
INSERT INTO "sms_wallet_ledger" (
  "id", "tenant_id", "branch_id", "wallet_id", "entry_type", "direction",
  "units", "balance_before", "balance_after", "reference_type", "reference_id",
  "description", "created_by", "created_at"
)
SELECT
  gen_random_uuid(),
  w."tenant_id",
  w."branch_id",
  w."id",
  'ADJUSTMENT',
  'CREDIT',
  w."available_units",
  0,
  w."available_units",
  'migration',
  w."id",
  'Opening balance migrated from legacy SMS wallet',
  'system',
  CURRENT_TIMESTAMP
FROM "branch_sms_wallets" w
WHERE w."available_units" > 0;
