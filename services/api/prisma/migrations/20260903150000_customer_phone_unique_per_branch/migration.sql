-- Client phones are unique per branch, not across the whole organisation.
-- Ishongororo and Kakinga can each have a client on 0760347636.
DROP INDEX IF EXISTS "customers_tenant_id_phone_key";

CREATE UNIQUE INDEX "customers_tenant_id_branch_id_phone_key"
ON "customers"("tenant_id", "branch_id", "phone");
