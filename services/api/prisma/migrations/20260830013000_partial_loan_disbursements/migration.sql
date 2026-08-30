ALTER TYPE "LoanStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_DISBURSED';

CREATE TYPE "LoanDisbursementSource" AS ENUM (
  'ASSIGNED_FLOAT',
  'COLLECTED_REPAYMENTS',
  'MIXED_CASH'
);

CREATE TABLE "loan_disbursements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "local_id" TEXT,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID NOT NULL,
  "loan_id" UUID NOT NULL,
  "recorded_by_user_id" UUID NOT NULL,
  "amount" DECIMAL(18, 2) NOT NULL,
  "assigned_float_amount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "collected_repayments_amount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "source" "LoanDisbursementSource" NOT NULL DEFAULT 'ASSIGNED_FLOAT',
  "disbursed_at" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "loan_disbursements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "loan_disbursements_local_id_key"
  ON "loan_disbursements"("local_id");

CREATE INDEX "loan_disbursements_tenant_id_branch_id_disbursed_at_idx"
  ON "loan_disbursements"("tenant_id", "branch_id", "disbursed_at");

CREATE INDEX "loan_disbursements_tenant_id_recorded_by_user_id_disbursed_at_idx"
  ON "loan_disbursements"("tenant_id", "recorded_by_user_id", "disbursed_at");

CREATE INDEX "loan_disbursements_tenant_id_loan_id_idx"
  ON "loan_disbursements"("tenant_id", "loan_id");

ALTER TABLE "loan_disbursements"
  ADD CONSTRAINT "loan_disbursements_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loan_disbursements"
  ADD CONSTRAINT "loan_disbursements_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "loan_disbursements"
  ADD CONSTRAINT "loan_disbursements_loan_id_fkey"
  FOREIGN KEY ("loan_id") REFERENCES "loans"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "loan_disbursements"
  ADD CONSTRAINT "loan_disbursements_recorded_by_user_id_fkey"
  FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "loan_disbursements" (
  "tenant_id",
  "branch_id",
  "loan_id",
  "recorded_by_user_id",
  "amount",
  "assigned_float_amount",
  "collected_repayments_amount",
  "source",
  "disbursed_at",
  "note",
  "created_at",
  "updated_at"
)
SELECT
  l."tenant_id",
  l."branch_id",
  l."id",
  COALESCE(a."officer_user_id", u."id"),
  l."principal",
  l."principal",
  0,
  'ASSIGNED_FLOAT'::"LoanDisbursementSource",
  COALESCE(l."disbursed_at", l."approved_at", l."created_at"),
  'Backfilled from existing issued loan principal.',
  COALESCE(l."disbursed_at", l."approved_at", l."created_at"),
  CURRENT_TIMESTAMP
FROM "loans" l
LEFT JOIN "loan_applications" a ON a."loan_id" = l."id"
LEFT JOIN LATERAL (
  SELECT "id"
  FROM "users"
  WHERE "tenant_id" = l."tenant_id"
  ORDER BY "created_at" ASC
  LIMIT 1
) u ON TRUE
WHERE l."principal" > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "loan_disbursements" d
    WHERE d."loan_id" = l."id"
  )
  AND COALESCE(a."officer_user_id", u."id") IS NOT NULL;
