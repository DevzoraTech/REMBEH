-- CreateEnum
CREATE TYPE "MerchantPaymentProvider" AS ENUM ('MTN_MOMO', 'AIRTEL_MONEY');

-- CreateTable
CREATE TABLE "merchant_payment_provider_configs" (
    "provider" "MerchantPaymentProvider" NOT NULL,
    "merchant_code" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_payment_provider_configs_pkey" PRIMARY KEY ("provider")
);
