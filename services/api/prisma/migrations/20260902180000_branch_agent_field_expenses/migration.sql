-- Branch managers can turn field-officer expense recording on or off.
ALTER TABLE "branches"
  ADD COLUMN "agent_field_expenses_enabled" BOOLEAN NOT NULL DEFAULT true;
