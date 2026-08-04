-- AlterEnum
ALTER TYPE "SubscriptionInterval" ADD VALUE IF NOT EXISTS 'THREE_MONTHS';
ALTER TYPE "SubscriptionInterval" ADD VALUE IF NOT EXISTS 'SIX_MONTHS';

-- Upsert Pro catalogue (monthly / 3 months / 6 months)
INSERT INTO "subscription_plans" ("id", "code", "name", "amount", "currency", "interval", "is_active", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'PRO', 'Pro', 255000.00, 'UGX', 'MONTHLY', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PRO_3M', 'Pro', 725000.00, 'UGX', 'THREE_MONTHS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PRO_6M', 'Pro', 1385000.00, 'UGX', 'SIX_MONTHS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "amount" = EXCLUDED."amount",
  "currency" = EXCLUDED."currency",
  "interval" = EXCLUDED."interval",
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;
