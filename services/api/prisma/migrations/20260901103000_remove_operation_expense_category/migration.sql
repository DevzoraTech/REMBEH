ALTER TABLE "branch_operation_expenses"
DROP COLUMN IF EXISTS "category";

DROP TYPE IF EXISTS "BranchOperationExpenseCategory";
