CREATE TYPE "LoanProcessingFeeType" AS ENUM ('PERCENTAGE', 'FIXED');

ALTER TABLE "loan_product_templates"
ADD COLUMN "processing_fee_type" "LoanProcessingFeeType" NOT NULL DEFAULT 'PERCENTAGE',
ADD COLUMN "processing_fee_fixed_amount" DECIMAL(18,2);

ALTER TABLE "loan_applications"
ADD COLUMN "processing_fee_type" "LoanProcessingFeeType",
ADD COLUMN "processing_fee_fixed_amount" DECIMAL(18,2);

UPDATE "loan_applications"
SET "processing_fee_type" = 'PERCENTAGE'
WHERE "processing_fee_percent" IS NOT NULL
  AND "processing_fee_type" IS NULL;
