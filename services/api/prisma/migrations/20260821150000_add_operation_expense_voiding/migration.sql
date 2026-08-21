ALTER TABLE "branch_operation_expenses"
ADD COLUMN "voided_at" TIMESTAMP(3),
ADD COLUMN "voided_by_user_id" UUID,
ADD COLUMN "void_reason" TEXT;

ALTER TABLE "branch_operation_expenses"
ADD CONSTRAINT "branch_operation_expenses_voided_by_user_id_fkey"
FOREIGN KEY ("voided_by_user_id")
REFERENCES "users"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
