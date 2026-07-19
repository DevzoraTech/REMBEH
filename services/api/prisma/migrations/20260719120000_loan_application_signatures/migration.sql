-- CreateEnum
CREATE TYPE "LoanApplicationSignerRole" AS ENUM ('APPLICANT', 'GUARANTOR', 'OFFICER');

-- AlterTable
ALTER TABLE "loan_applications"
  ADD COLUMN "signed_agreement_key" TEXT,
  ADD COLUMN "signed_agreement_hash" TEXT,
  ADD COLUMN "signed_agreement_version" INTEGER;

-- CreateTable
CREATE TABLE "loan_application_signatures" (
    "id" UUID NOT NULL,
    "loan_application_id" UUID NOT NULL,
    "signer_role" "LoanApplicationSignerRole" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "locked" BOOLEAN NOT NULL DEFAULT true,
    "signer_name" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL,
    "signature_storage_key" TEXT NOT NULL,
    "strokes_storage_key" TEXT NOT NULL,
    "metadata_storage_key" TEXT NOT NULL,
    "png_content_hash" TEXT NOT NULL,
    "strokes_content_hash" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_application_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loan_application_signatures_loan_application_id_signer_role_idx"
  ON "loan_application_signatures"("loan_application_id", "signer_role");

-- CreateIndex
CREATE UNIQUE INDEX "loan_application_signatures_loan_application_id_signer_role_version_key"
  ON "loan_application_signatures"("loan_application_id", "signer_role", "version");

-- AddForeignKey
ALTER TABLE "loan_application_signatures"
  ADD CONSTRAINT "loan_application_signatures_loan_application_id_fkey"
  FOREIGN KEY ("loan_application_id") REFERENCES "loan_applications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
