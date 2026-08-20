-- Add localId column to LoanApplication for offline sync idempotency
ALTER TABLE "loan_applications" ADD COLUMN "local_id" TEXT;

-- Add unique constraint on localId (nullable unique is allowed in PostgreSQL)
CREATE UNIQUE INDEX "loan_applications_local_id_key" ON "loan_applications"("local_id") WHERE "local_id" IS NOT NULL;

-- Add localId column to Repayment for offline sync idempotency
ALTER TABLE "repayments" ADD COLUMN "local_id" TEXT;

-- Add unique constraint on localId
CREATE UNIQUE INDEX "repayments_local_id_key" ON "repayments"("local_id") WHERE "local_id" IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN "loan_applications"."local_id" IS 'Client-generated UUID for offline sync idempotency';
COMMENT ON COLUMN "repayments"."local_id" IS 'Client-generated UUID for offline sync idempotency';
