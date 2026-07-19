ALTER TABLE "otp_challenges"
ADD COLUMN "sent_at" TIMESTAMP(3),
ADD COLUMN "last_sent_at" TIMESTAMP(3),
ADD COLUMN "resend_count" INTEGER NOT NULL DEFAULT 0;
