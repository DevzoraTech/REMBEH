-- Named operator SMS contacts for payment verification alerts.
-- These SMS are billed to the platform Pahappa account, not organisation wallets.

CREATE TABLE "control_center_operator_sms_contacts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_center_operator_sms_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "control_center_operator_sms_contacts_phone_key"
ON "control_center_operator_sms_contacts"("phone");

CREATE INDEX "control_center_operator_sms_contacts_active_sort_order_idx"
ON "control_center_operator_sms_contacts"("active", "sort_order");

INSERT INTO "control_center_operator_sms_contacts"
  ("id", "name", "phone", "active", "sort_order", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'Hamza', '+256777823011', true, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Bonny', '+256752039673', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
