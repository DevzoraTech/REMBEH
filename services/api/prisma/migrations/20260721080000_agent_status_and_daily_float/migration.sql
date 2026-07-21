-- AlterEnum: soft-deactivate agents separately from SUSPENDED
ALTER TYPE "UserStatus" ADD VALUE 'INACTIVE';

-- Daily cash float given to field agents before fieldwork
CREATE TABLE "agent_daily_floats" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "agent_id" UUID NOT NULL,
    "float_date" DATE NOT NULL,
    "amount_given" DECIMAL(14,2) NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_daily_floats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_daily_floats_tenant_id_agent_id_float_date_key"
  ON "agent_daily_floats"("tenant_id", "agent_id", "float_date");

CREATE INDEX "agent_daily_floats_tenant_id_float_date_idx"
  ON "agent_daily_floats"("tenant_id", "float_date");

CREATE INDEX "agent_daily_floats_tenant_id_branch_id_float_date_idx"
  ON "agent_daily_floats"("tenant_id", "branch_id", "float_date");

ALTER TABLE "agent_daily_floats"
  ADD CONSTRAINT "agent_daily_floats_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_daily_floats"
  ADD CONSTRAINT "agent_daily_floats_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_daily_floats"
  ADD CONSTRAINT "agent_daily_floats_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_daily_floats"
  ADD CONSTRAINT "agent_daily_floats_recorded_by_user_id_fkey"
  FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ensure user.activate exists for managers/owners who manage agent status
INSERT INTO "permissions" ("id", "tenant_id", "key", "module_key", "description", "created_at")
SELECT
  gen_random_uuid(),
  "tenants"."id",
  'user.activate',
  'identity',
  'Identity: user.activate',
  CURRENT_TIMESTAMP
FROM "tenants"
ON CONFLICT ("tenant_id", "key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions"
  ON "permissions"."tenant_id" = "roles"."tenant_id"
WHERE "roles"."name" IN ('Branch Manager', 'Account Owner', 'Workspace Owner')
  AND "permissions"."key" = 'user.activate'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
