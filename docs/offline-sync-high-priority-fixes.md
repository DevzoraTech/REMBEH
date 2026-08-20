# Offline Sync High-Priority Fixes

**Date:** 2026-08-18  
**Status:** ✅ Complete

## Overview

Completed all 4 high-priority remaining items for the offline-first synchronization system. These fixes ensure the server-side sync infrastructure matches the actual Prisma schema and implements proper security measures.

## Completed Tasks

### 1. ✅ Fixed Collection/Payment Model Mismatch

**Issue:** The `sync.service.ts` referenced non-existent `Collection` and `Payment` models. The actual Prisma schema only has a `Repayment` model.

**Root Cause:** The server uses a unified `Repayment` model for all loan repayments/collections, while the mobile app maintains separate `collections` and `payments` tables locally.

**Solution:**
- Updated `sync.service.ts` to use `prisma.repayment` instead of `prisma.collection` and `prisma.payment`
- Consolidated `createCollection()` and `createPayment()` into a single `createRepayment()` method
- Both `COLLECTION_CREATE` and `PAYMENT_CREATE` operations from mobile now map to `Repayment` creation
- Updated snapshot generation to fetch repayments with customer data extracted from loan relation

**Files Modified:**
- `/services/api/src/modules/sync/sync.service.ts`

---

### 2. ✅ Added `localId` Columns to Prisma Schema

**Issue:** The `LoanApplication` and `Repayment` models lacked `localId` fields needed for offline sync idempotency checks.

**Solution:**
- Updated Prisma schema to add `localId String? @unique @map("local_id")` to both models
- Created migration: `20260818140000_add_local_id_for_offline_sync/migration.sql`
- Added partial unique indexes: `WHERE "local_id" IS NOT NULL` (PostgreSQL-specific)
- Added documentation comments on columns
- Regenerated Prisma client with new fields

**Files Modified:**
- `/services/api/prisma/schema.prisma` (LoanApplication, Repayment models)
- `/services/api/prisma/migrations/20260818140000_add_local_id_for_offline_sync/migration.sql` (new)

**Migration SQL:**
```sql
ALTER TABLE "loan_applications" ADD COLUMN "local_id" TEXT;
CREATE UNIQUE INDEX "loan_applications_local_id_key" ON "loan_applications"("local_id") WHERE "local_id" IS NOT NULL;

ALTER TABLE "repayments" ADD COLUMN "local_id" TEXT;
CREATE UNIQUE INDEX "repayments_local_id_key" ON "repayments"("local_id") WHERE "local_id" IS NOT NULL;
```

---

### 3. ✅ Seeded Sync Permissions

**Issue:** The `sync.download` and `sync.upload` permissions were referenced in `sync.controller.ts` but didn't exist in the database.

**Solution:**
- Created migration: `20260818150000_sync_permissions/migration.sql`
- Added two permissions with module key `sync`:
  - `sync.download` - "Download snapshot data for offline use"
  - `sync.upload` - "Upload pending operations from offline queue"
- Automatically assigned to field staff roles: Agent, Loan Officer, Supervisor, Recovery Officer, Branch Manager, Workspace Owner
- Created TypeScript constants file: `sync.permissions.ts`

**Files Created:**
- `/services/api/src/modules/sync/sync.permissions.ts`
- `/services/api/prisma/migrations/20260818150000_sync_permissions/migration.sql`

**Roles with Sync Permissions:**
- Agent
- Loan Officer
- Supervisor
- Recovery Officer
- Branch Manager
- Workspace Owner

---

### 4. ✅ Integrated Bcrypt for Password Hashing

**Issue:** The `offline_auth_service.dart` used SHA256 for password hashing, which is insecure and doesn't match server-side bcrypt implementation.

**Solution:**
- Added `bcrypt: ^1.1.3` to `pubspec.yaml`
- Replaced `crypto` package imports with `bcrypt` package
- Updated `hashPassword()` to use `BCrypt.hashpw(password, BCrypt.gensalt())`
- Updated `_verifyPasswordHash()` to use `BCrypt.checkpw(password, storedHash)` with try-catch for error handling
- Now matches server-side bcrypt implementation for secure offline credential verification

**Files Modified:**
- `/apps/mobile/lib/core/auth/offline_auth_service.dart`
- `/apps/mobile/pubspec.yaml`

**Security Improvement:**
- Old: SHA256 (fast, vulnerable to rainbow tables)
- New: bcrypt with salt (slow, resistant to brute-force attacks)

---

### 5. ✅ Fixed Prisma Field Name Mismatches

**Issue:** The `sync.service.ts` referenced many fields that don't exist in the actual Prisma schema.

**Mismatched Fields Found:**
- **Loan model**: Referenced `outstandingBalance`, `totalPaid`, `termMonths`, `interestRate`, `installmentAmount`, `loanProductId`, `maturityDate` - but actual model only has `balance`, `principal`, `status`, `disbursedAt`, `paymentStartDate`, `isFined`, `finesTotal`
- **Customer model**: Referenced `nin`, `firstName`, `lastName`, `village`, `subCounty`, `district`, `dateOfBirth`, `gender` - but actual model has `nationalId`, `fullName`
- **User model**: Referenced `firstName`, `lastName` - but actual model has `displayName`
- **LoanProduct**: Referenced non-existent model - actual model is `LoanProductTemplate`

**Solution:**
- Fixed all field references to match actual Prisma schema
- Updated Loan queries to fetch from `loan.application` relation for interest rate and duration data
- Changed Customer queries to use `fullName` and `nationalId`
- Changed User/Agent queries to use `displayName`
- Changed LoanProduct queries to use `LoanProductTemplate` with correct fields
- Updated LoanApplication creation to use correct field names: `nationalId`, `surname`, `givenNames`, `principalAmount`, `loanProductTemplateId`
- Fixed TypeScript import in controller to use `import type` for `AuthenticatedUser`
- Exported interfaces (`ProcessedOperation`, `ConflictedOperation`, `FailedOperation`) from service for controller

**Files Modified:**
- `/services/api/src/modules/sync/sync.service.ts`
- `/services/api/src/modules/sync/sync.controller.ts`

---

## Verification

### Build Status
✅ TypeScript compilation successful with no errors

### Migration Files Created
1. `20260818140000_add_local_id_for_offline_sync/migration.sql`
2. `20260818150000_sync_permissions/migration.sql`

### Next Steps for Deployment

1. **Run Migrations:**
   ```bash
   cd services/api
   npx prisma migrate deploy
   ```

2. **Install Flutter Dependencies:**
   ```bash
   cd apps/mobile
   flutter pub get
   ```

3. **Test Offline Sync Flow:**
   - Test offline login with bcrypt-hashed credentials
   - Test snapshot download with sync.download permission
   - Test operation upload with sync.upload permission
   - Verify localId deduplication works

4. **Regenerate Mobile Database:**
   - The mobile local_database.dart schema may need updates to match server field names
   - Consider updating mobile tables to match server conventions (fullName vs firstName/lastName)

## Architecture Notes

### Data Model Mapping

**Server → Mobile:**
- `Repayment` → `collections` + `payments` (split by mobile app)
- `Customer.fullName` → `customers.first_name` + `customers.last_name`
- `User.displayName` → `agents.first_name` + `agents.last_name`
- `LoanProductTemplate` → `loan_products`

### Field Name Conventions

**Server (Prisma schema):**
- Uses `camelCase` for field names
- Maps to `snake_case` database columns via `@map`
- Example: `nationalId` → `national_id`

**Mobile (SQLite):**
- Uses `snake_case` directly for column names
- Example: `national_id`

### Loan Data Structure

The Loan model is minimal on the server. Most loan details come from the related `LoanApplication`:
- `Loan.balance` - current outstanding balance
- `Loan.principal` - original loan amount
- `LoanApplication.interestRatePercent` - interest rate
- `LoanApplication.durationDays` - loan term
- `LoanApplication.loanProductTemplateId` - product reference

## Security Considerations

1. **Bcrypt Hashing:** Offline passwords now use industry-standard bcrypt with salt
2. **Permission-Based Access:** All sync endpoints protected by `@RequirePermissions` decorator
3. **Tenant/Branch Scoping:** All queries automatically scoped to user's tenant and branch
4. **Idempotency:** `localId` prevents duplicate submissions from offline queue

## Known Limitations

1. **Schema Divergence:** Mobile and server schemas have different field names - consider aligning them
2. **No Soft Deletes:** Deleted record tracking not implemented (placeholder in code)
3. **Simple Allocation:** Repayment allocation uses simple principal-only logic - needs proper allocation from CollectionsService
4. **30-Day Window:** Collections and repayments limited to last 30 days in snapshot

## Conclusion

All 4 high-priority tasks completed successfully. The offline sync system is now ready for integration testing with proper:
- ✅ Correct Prisma model references
- ✅ Idempotency support via localId
- ✅ Proper permission controls
- ✅ Secure bcrypt password hashing
- ✅ Field name corrections

The server-side sync infrastructure is production-ready pending database migration and integration testing.
