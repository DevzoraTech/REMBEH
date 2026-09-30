CREATE TYPE "BranchOperationBankingType" AS ENUM ('BANKING', 'MOBILE_MONEY');

ALTER TABLE "branch_operation_bankings"
  ADD COLUMN "type" "BranchOperationBankingType" NOT NULL DEFAULT 'BANKING';
