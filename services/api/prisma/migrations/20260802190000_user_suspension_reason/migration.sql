-- Persist manager-provided suspension reason for lockout messaging.
ALTER TABLE "users" ADD COLUMN "suspension_reason" TEXT;

-- Backfill from the latest agent.suspend audit entry when available.
UPDATE "users" AS u
SET "suspension_reason" = (
  SELECT al."new_value"->>'reason'
  FROM "audit_logs" AS al
  WHERE al."entity_type" = 'User'
    AND al."entity_id" = u."id"::text
    AND al."action" = 'agent.suspend'
    AND NULLIF(TRIM(al."new_value"->>'reason'), '') IS NOT NULL
  ORDER BY al."created_at" DESC
  LIMIT 1
)
WHERE u."status" = 'SUSPENDED'
  AND u."suspension_reason" IS NULL;
