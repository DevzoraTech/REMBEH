-- Prevent duplicate branch names within the same tenant workspace.
CREATE UNIQUE INDEX "branches_tenant_id_name_key" ON "branches"("tenant_id", "name");
