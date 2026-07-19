-- User email and phone identify a real person account across REMBEH.
-- Normalize existing early-development rows before enforcing global uniqueness.
UPDATE "users"
SET
  "email" = lower(btrim("email")),
  "phone" = regexp_replace(btrim("phone"), '[[:space:]()-]', '', 'g');

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
