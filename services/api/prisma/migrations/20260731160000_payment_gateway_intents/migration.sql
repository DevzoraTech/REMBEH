-- Flutterwave payment intents (idempotent tx_ref, server-side verification audit).
CREATE TYPE "PaymentGatewayProvider" AS ENUM ('FLUTTERWAVE');
CREATE TYPE "PaymentGatewayIntentStatus" AS ENUM (
  'PENDING',
  'SUCCESSFUL',
  'FAILED',
  'CANCELLED',
  'REVERSED'
);

CREATE TABLE "payment_gateway_intents" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "provider" "PaymentGatewayProvider" NOT NULL DEFAULT 'FLUTTERWAVE',
  "tx_ref" TEXT NOT NULL,
  "flw_transaction_id" TEXT,
  "flw_flw_ref" TEXT,
  "amount" DECIMAL(18, 2) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "PaymentGatewayIntentStatus" NOT NULL DEFAULT 'PENDING',
  "purpose" TEXT NOT NULL,
  "customer_email" TEXT,
  "customer_phone" TEXT,
  "customer_name" TEXT,
  "loan_id" UUID,
  "branch_id" UUID,
  "initiated_by_user_id" UUID,
  "payment_link" TEXT,
  "verified_amount" DECIMAL(18, 2),
  "verified_currency" TEXT,
  "verified_at" TIMESTAMP(3),
  "failure_reason" TEXT,
  "metadata" JSONB,
  "last_event_type" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_gateway_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_gateway_intents_tx_ref_key" ON "payment_gateway_intents"("tx_ref");
CREATE INDEX "payment_gateway_intents_tenant_id_status_created_at_idx" ON "payment_gateway_intents"("tenant_id", "status", "created_at");
CREATE INDEX "payment_gateway_intents_tenant_id_loan_id_idx" ON "payment_gateway_intents"("tenant_id", "loan_id");
CREATE INDEX "payment_gateway_intents_flw_transaction_id_idx" ON "payment_gateway_intents"("flw_transaction_id");

ALTER TABLE "payment_gateway_intents"
  ADD CONSTRAINT "payment_gateway_intents_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
