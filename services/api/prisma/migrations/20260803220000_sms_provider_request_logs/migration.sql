-- Provider request/response audit logs (no credentials stored).

CREATE TABLE "sms_provider_request_logs" (
  "id" UUID NOT NULL,
  "tenant_id" UUID,
  "branch_id" UUID,
  "wallet_id" UUID,
  "sms_message_id" UUID,
  "provider" TEXT NOT NULL DEFAULT 'pahappa',
  "request_time" TIMESTAMP(3) NOT NULL,
  "provider_endpoint" TEXT NOT NULL,
  "request_reference" TEXT NOT NULL,
  "request_metadata" JSONB NOT NULL,
  "response_code" TEXT,
  "provider_message_id" TEXT,
  "response_time_ms" INTEGER NOT NULL,
  "outcome" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sms_provider_request_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sms_provider_request_logs_sms_message_id_idx"
  ON "sms_provider_request_logs"("sms_message_id");
CREATE INDEX "sms_provider_request_logs_request_reference_idx"
  ON "sms_provider_request_logs"("request_reference");
CREATE INDEX "sms_provider_request_logs_request_time_idx"
  ON "sms_provider_request_logs"("request_time");

ALTER TABLE "sms_provider_request_logs"
  ADD CONSTRAINT "sms_provider_request_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sms_provider_request_logs"
  ADD CONSTRAINT "sms_provider_request_logs_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sms_provider_request_logs"
  ADD CONSTRAINT "sms_provider_request_logs_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "branch_sms_wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sms_provider_request_logs"
  ADD CONSTRAINT "sms_provider_request_logs_sms_message_id_fkey"
  FOREIGN KEY ("sms_message_id") REFERENCES "sms_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
