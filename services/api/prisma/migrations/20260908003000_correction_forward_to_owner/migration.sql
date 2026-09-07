-- Forward-to-owner workflow for repayment corrections on owner-approved reports.
ALTER TABLE "repayment_correction_requests"
ADD COLUMN "forwarded_to_owner_at" TIMESTAMP(3),
ADD COLUMN "forwarded_to_owner_by_id" UUID,
ADD COLUMN "owner_authorized_at" TIMESTAMP(3),
ADD COLUMN "owner_authorized_by_id" UUID;

ALTER TABLE "repayment_correction_requests"
ADD CONSTRAINT "repayment_correction_requests_forwarded_to_owner_by_id_fkey"
FOREIGN KEY ("forwarded_to_owner_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "repayment_correction_requests"
ADD CONSTRAINT "repayment_correction_requests_owner_authorized_by_id_fkey"
FOREIGN KEY ("owner_authorized_by_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
