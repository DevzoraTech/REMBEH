-- CreateEnum
CREATE TYPE "LoanReminderBatchStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "LoanReminderItemStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED_NO_CREDIT', 'SKIPPED_NO_PHONE', 'SKIPPED_ALREADY_SENT');

-- CreateTable
CREATE TABLE "loan_reminder_batches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "filter" TEXT NOT NULL,
    "status" "LoanReminderBatchStatus" NOT NULL DEFAULT 'QUEUED',
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "loan_reminder_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_reminder_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "status" "LoanReminderItemStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotency_key" TEXT NOT NULL,
    "sms_message_id" UUID,
    "failure_reason" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_reminder_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loan_reminder_batches_tenant_id_branch_id_status_created_at_idx" ON "loan_reminder_batches"("tenant_id", "branch_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "loan_reminder_items_idempotency_key_key" ON "loan_reminder_items"("idempotency_key");

-- CreateIndex
CREATE INDEX "loan_reminder_items_batch_id_status_idx" ON "loan_reminder_items"("batch_id", "status");

-- CreateIndex
CREATE INDEX "loan_reminder_items_tenant_id_loan_id_created_at_idx" ON "loan_reminder_items"("tenant_id", "loan_id", "created_at");

-- CreateIndex
CREATE INDEX "loan_reminder_items_status_created_at_idx" ON "loan_reminder_items"("status", "created_at");

-- CreateIndex
CREATE INDEX "sms_messages_message_type_trigger_reference_id_idx" ON "sms_messages"("message_type", "trigger_reference_id");

-- AddForeignKey
ALTER TABLE "loan_reminder_batches" ADD CONSTRAINT "loan_reminder_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_reminder_batches" ADD CONSTRAINT "loan_reminder_batches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_reminder_batches" ADD CONSTRAINT "loan_reminder_batches_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_reminder_items" ADD CONSTRAINT "loan_reminder_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_reminder_items" ADD CONSTRAINT "loan_reminder_items_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_reminder_items" ADD CONSTRAINT "loan_reminder_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "loan_reminder_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_reminder_items" ADD CONSTRAINT "loan_reminder_items_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
