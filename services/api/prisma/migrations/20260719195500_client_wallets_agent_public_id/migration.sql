-- AlterTable: human-reportable agent public id
ALTER TABLE "users" ADD COLUMN "public_id" TEXT;

-- Backfill unique public ids for existing users
DO $$
DECLARE
  r RECORD;
  candidate TEXT;
  n INT;
BEGIN
  FOR r IN SELECT id FROM users WHERE public_id IS NULL LOOP
    LOOP
      n := floor(random() * 90000 + 10000)::int;
      candidate := 'A-' || n::text;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE public_id = candidate);
    END LOOP;
    UPDATE users SET public_id = candidate WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX "users_public_id_key" ON "users"("public_id");

-- CreateTable: per-loan client wallets
CREATE TABLE "client_wallets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "loan_application_id" UUID,
    "currency" TEXT NOT NULL,
    "opening_balance" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_wallets_loan_id_key" ON "client_wallets"("loan_id");
CREATE UNIQUE INDEX "client_wallets_loan_application_id_key" ON "client_wallets"("loan_application_id");
CREATE INDEX "client_wallets_tenant_id_customer_id_idx" ON "client_wallets"("tenant_id", "customer_id");
CREATE INDEX "client_wallets_tenant_id_branch_id_idx" ON "client_wallets"("tenant_id", "branch_id");

ALTER TABLE "client_wallets" ADD CONSTRAINT "client_wallets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_wallets" ADD CONSTRAINT "client_wallets_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_wallets" ADD CONSTRAINT "client_wallets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_wallets" ADD CONSTRAINT "client_wallets_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_wallets" ADD CONSTRAINT "client_wallets_loan_application_id_fkey" FOREIGN KEY ("loan_application_id") REFERENCES "loan_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill wallets for existing loans (opening = outstanding + paid to date)
INSERT INTO "client_wallets" (
  "id",
  "tenant_id",
  "branch_id",
  "customer_id",
  "loan_id",
  "loan_application_id",
  "currency",
  "opening_balance",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  l."tenant_id",
  l."branch_id",
  l."customer_id",
  l."id",
  la."id",
  l."currency",
  (l."balance" + COALESCE((
    SELECT SUM(r."amount") FROM "repayments" r WHERE r."loan_id" = l."id"
  ), 0)),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "loans" l
LEFT JOIN "loan_applications" la ON la."loan_id" = l."id"
WHERE NOT EXISTS (
  SELECT 1 FROM "client_wallets" w WHERE w."loan_id" = l."id"
);
