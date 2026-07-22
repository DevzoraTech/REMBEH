CREATE TYPE "BorrowerListType" AS ENUM ('BLACKLISTED', 'WATCHLIST');

CREATE TABLE "borrower_list_entries" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "branch_id" UUID,
  "customer_id" UUID,
  "created_by_user_id" UUID NOT NULL,
  "type" "BorrowerListType" NOT NULL,
  "full_name" TEXT,
  "national_id" TEXT NOT NULL,
  "phone" TEXT,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "borrower_list_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "borrower_list_entries_tenant_id_national_id_key"
  ON "borrower_list_entries"("tenant_id", "national_id");

CREATE INDEX "borrower_list_entries_tenant_id_type_idx"
  ON "borrower_list_entries"("tenant_id", "type");

CREATE INDEX "borrower_list_entries_tenant_id_branch_id_type_idx"
  ON "borrower_list_entries"("tenant_id", "branch_id", "type");

CREATE INDEX "borrower_list_entries_tenant_id_customer_id_idx"
  ON "borrower_list_entries"("tenant_id", "customer_id");
