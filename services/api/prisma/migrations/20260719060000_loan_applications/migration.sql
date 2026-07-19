-- CreateEnum
CREATE TYPE "LoanApplicationStatus" AS ENUM ('DRAFT', 'VERIFIED', 'SUBMITTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "LoanApplicationMediaType" AS ENUM (
  'PASSPORT',
  'NIN_FRONT',
  'NIN_BACK',
  'GUARANTOR_NIN_FRONT',
  'GUARANTOR_NIN_BACK',
  'COLLATERAL_DOC',
  'SUPPORTING_DOC',
  'OTHER_DOC',
  'SIGNATURE_APPLICANT',
  'SIGNATURE_GUARANTOR',
  'SIGNATURE_OFFICER'
);

-- CreateTable
CREATE TABLE "loan_applications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "officer_user_id" UUID NOT NULL,
    "customer_id" UUID,
    "loan_id" UUID,
    "status" "LoanApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "surname" TEXT,
    "given_names" TEXT,
    "phone" TEXT,
    "national_id" TEXT,
    "district" TEXT,
    "sub_county" TEXT,
    "parish" TEXT,
    "village" TEXT,
    "principal_amount" DECIMAL(18,2),
    "interest_rate_percent" DECIMAL(8,4),
    "duration_days" INTEGER,
    "processing_fee" DECIMAL(18,2),
    "collateral_type" TEXT,
    "smile_job_id" TEXT,
    "smile_result" JSONB,
    "verification_code" TEXT,
    "verified_at" TIMESTAMP(3),
    "terms_confirmed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_application_guarantors" (
    "id" UUID NOT NULL,
    "loan_application_id" UUID NOT NULL,
    "full_name" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_application_guarantors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_application_media" (
    "id" UUID NOT NULL,
    "loan_application_id" UUID NOT NULL,
    "type" "LoanApplicationMediaType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "checksum" TEXT,
    "file_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_application_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loan_applications_loan_id_key" ON "loan_applications"("loan_id");

-- CreateIndex
CREATE INDEX "loan_applications_tenant_id_status_idx" ON "loan_applications"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "loan_applications_tenant_id_branch_id_idx" ON "loan_applications"("tenant_id", "branch_id");

-- CreateIndex
CREATE INDEX "loan_applications_tenant_id_officer_user_id_idx" ON "loan_applications"("tenant_id", "officer_user_id");

-- CreateIndex
CREATE INDEX "loan_applications_tenant_id_national_id_idx" ON "loan_applications"("tenant_id", "national_id");

-- CreateIndex
CREATE INDEX "loan_applications_tenant_id_phone_idx" ON "loan_applications"("tenant_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "loan_application_guarantors_loan_application_id_key" ON "loan_application_guarantors"("loan_application_id");

-- CreateIndex
CREATE INDEX "loan_application_media_loan_application_id_idx" ON "loan_application_media"("loan_application_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_application_media_loan_application_id_type_key" ON "loan_application_media"("loan_application_id", "type");

-- CreateIndex
CREATE INDEX "customers_tenant_id_national_id_idx" ON "customers"("tenant_id", "national_id");

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_officer_user_id_fkey" FOREIGN KEY ("officer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_application_guarantors" ADD CONSTRAINT "loan_application_guarantors_loan_application_id_fkey" FOREIGN KEY ("loan_application_id") REFERENCES "loan_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_application_media" ADD CONSTRAINT "loan_application_media_loan_application_id_fkey" FOREIGN KEY ("loan_application_id") REFERENCES "loan_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ensure Agent role can list applications
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" = 'Agent'
  AND "permissions"."key" = 'loan.read'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
