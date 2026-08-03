-- SMS delivery status, uncertain holds, retry chain, reservation expiry

ALTER TYPE "SmsMessageStatus" ADD VALUE 'PROVIDER_ACCEPTED';
ALTER TYPE "SmsMessageStatus" ADD VALUE 'PROVIDER_UNCERTAIN';

CREATE TYPE "SmsDeliveryStatus" AS ENUM (
  'NOT_APPLICABLE',
  'PENDING',
  'DELIVERED',
  'FAILED',
  'UNKNOWN'
);

ALTER TABLE "sms_messages"
  ADD COLUMN "delivery_status" "SmsDeliveryStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN "parent_message_id" UUID,
  ADD COLUMN "attempt_number" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "reservation_expires_at" TIMESTAMP(3),
  ADD COLUMN "delivered_at" TIMESTAMP(3);

CREATE INDEX "sms_messages_status_reservation_expires_at_idx"
  ON "sms_messages"("status", "reservation_expires_at");
CREATE INDEX "sms_messages_parent_message_id_idx"
  ON "sms_messages"("parent_message_id");

ALTER TABLE "sms_messages"
  ADD CONSTRAINT "sms_messages_parent_message_id_fkey"
  FOREIGN KEY ("parent_message_id") REFERENCES "sms_messages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
