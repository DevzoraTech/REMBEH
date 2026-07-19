-- CreateEnum
CREATE TYPE "ApplicantGender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- AlterTable
ALTER TABLE "loan_applications" ADD COLUMN "gender" "ApplicantGender";
ALTER TABLE "loan_applications" ADD COLUMN "date_of_birth" DATE;
