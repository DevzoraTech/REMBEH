-- Loan type templates + application snapshot fields for historical pricing.

CREATE TYPE "LoanInterestType" AS ENUM ('FLAT');
CREATE TYPE "LoanTermUnit" AS ENUM ('DAYS', 'MONTHS', 'YEARS');
CREATE TYPE "LoanRepaymentFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

CREATE TABLE "loan_product_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "interest_rate_percent" DECIMAL(8,4) NOT NULL,
    "interest_type" "LoanInterestType" NOT NULL DEFAULT 'FLAT',
    "term_value" INTEGER NOT NULL,
    "term_unit" "LoanTermUnit" NOT NULL,
    "repayment_frequency" "LoanRepaymentFrequency" NOT NULL,
    "processing_fee_percent" DECIMAL(8,4) NOT NULL,
    "penalty_rate_percent" DECIMAL(8,4) NOT NULL,
    "fine_period_days" INTEGER NOT NULL DEFAULT 10,
    "min_loan_amount" DECIMAL(18,2),
    "max_loan_amount" DECIMAL(18,2),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_product_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "loan_product_templates_tenant_id_branch_id_is_active_idx"
  ON "loan_product_templates"("tenant_id", "branch_id", "is_active");
CREATE INDEX "loan_product_templates_tenant_id_is_active_sort_order_idx"
  ON "loan_product_templates"("tenant_id", "is_active", "sort_order");

ALTER TABLE "loan_product_templates"
  ADD CONSTRAINT "loan_product_templates_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "loan_product_templates"
  ADD CONSTRAINT "loan_product_templates_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "loan_applications"
ADD COLUMN "loan_product_template_id" UUID,
ADD COLUMN "template_name" TEXT,
ADD COLUMN "interest_type" "LoanInterestType",
ADD COLUMN "term_value" INTEGER,
ADD COLUMN "term_unit" "LoanTermUnit",
ADD COLUMN "repayment_frequency" "LoanRepaymentFrequency",
ADD COLUMN "processing_fee_percent" DECIMAL(8,4),
ADD COLUMN "penalty_rate_percent" DECIMAL(8,4),
ADD COLUMN "fine_period_days" INTEGER,
ADD COLUMN "loan_purpose" TEXT;

CREATE INDEX "loan_applications_tenant_id_loan_product_template_id_idx"
  ON "loan_applications"("tenant_id", "loan_product_template_id");

ALTER TABLE "loan_applications"
  ADD CONSTRAINT "loan_applications_loan_product_template_id_fkey"
  FOREIGN KEY ("loan_product_template_id") REFERENCES "loan_product_templates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
