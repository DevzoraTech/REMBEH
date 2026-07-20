-- Payment start settings belong on the loan product template (and application snapshot).
-- Tenant/branch LoanPaymentStartPolicy remains as a legacy fallback for apps without a template.

ALTER TABLE "loan_product_templates"
  ADD COLUMN "payment_start_policy" "PaymentStartPolicyType" NOT NULL DEFAULT 'NEXT_DAY',
  ADD COLUMN "payment_start_delay_days" INTEGER,
  ADD COLUMN "allow_agent_date_pick" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "loan_applications"
  ADD COLUMN "payment_start_policy" "PaymentStartPolicyType",
  ADD COLUMN "payment_start_delay_days" INTEGER,
  ADD COLUMN "allow_agent_date_pick" BOOLEAN;
