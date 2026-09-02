CREATE TYPE "CustomerVoidDisposition" AS ENUM ('BLACKLISTED', 'WARNING');

ALTER TABLE "customers"
  ADD COLUMN "voided_at" TIMESTAMP(3),
  ADD COLUMN "voided_by_user_id" UUID,
  ADD COLUMN "void_disposition" "CustomerVoidDisposition",
  ADD COLUMN "void_reason" TEXT;

CREATE INDEX "customers_tenant_id_voided_at_idx"
  ON "customers"("tenant_id", "voided_at");

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_voided_by_user_id_fkey"
  FOREIGN KEY ("voided_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
