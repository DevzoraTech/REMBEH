# REMBEH Agent App Gap Plan

This plan turns the agent app vision into a build checklist. The goal is to make the Flutter app the field officer's full digital office: no paper, no calculator, no notebook, and no WhatsApp dependency for daily work.

## Current Mobile App Snapshot

Already present in `apps/mobile`:

- Agent login, secure session storage, refresh token handling, idle logout, and forced update screen.
- Shell with `Home`, `Records`, and `Search`.
- Home summary using live repayments and submitted loan applications.
- Records tab for repayments and loan applications, with filters.
- Client search backed by the collections API.
- Customer registration screen with simple phone validation.
- New loan application flow with product lookup, applicant verification, media upload, signatures, and submit.
- Repayment recording flow with live collections API.
- Client and application detail sheets.
- Profile screen with profile photo/selfie capture.
- Realtime updates for repayments and loan applications.
- Camera capture and electronic signature building blocks.

Important gaps:

- No daily operation flow for receiving float, working status, end-day return, or manager clearance.
- No dedicated Customers module.
- No dedicated Operations module containing loans, collections, expenses, wallet, and reports.
- No tasks, route planner, maps, calendar, notifications inbox, internal messages, expense approval flow, offline queue, visit tracking, document scanner/OCR, operational wallet, emergency tools, or performance dashboard.

## Product Navigation Target

Bottom navigation should become:

- `Home`
- `Customers`
- `Operations`
- `Tasks`
- `Profile`

Inside `Operations`:

- `Daily Operations`
- `Loans`
- `Collections`
- `Expenses`
- `Wallet`
- `Reports`

`Search` should remain available inside Customers and Home, not as the main bottom navigation item.

## Build Rules

- Use live API data only. No mock field records in production flows.
- Derive tenant, branch, and agent scope from the authenticated session. The mobile app must not send tenant or branch IDs for normal writes.
- Every field action must be auditable with actor, branch, GPS where required, timestamp, device ID where available, and sync state.
- Offline writes must be queued locally, encrypted where practical, idempotent, and synced exactly once.
- Agent actions must emit events so the manager web app can update without phone calls.
- Every feature must respect existing module boundaries: controller, service, repository, DTO/contract, permissions, events, audit/outbox, and tests.

## Phase 1: Agent Daily Office Foundation

Purpose: make the app reflect the agent's real working day.

### 1. Home Dashboard

Current status: partial.

Keep:

- Greeting.
- Collected today.
- Repayment count.
- Due today.
- New applications count.

Add:

- Today's duty status: `Not started`, `Working`, `Waiting for manager`, `Cleared`.
- Today's float received.
- Remaining float.
- Loans issued today.
- Repayments collected today.
- Customers visited.
- Pending visits.
- Notifications count.
- Manager messages count.
- Quick actions: `New Loan`, `Collect Payment`, `Customers`, `Schedule`, `Maps`, `Reports`.

API needed:

- `GET /agent-office/today` or equivalent aggregate endpoint.
- It should return dashboard, operation, route, tasks, notifications, and wallet summary in one mobile-friendly payload.

Acceptance:

- After login, an agent sees the correct day state within one refresh.
- Amounts match manager web app agent accountability for the same day.
- Empty states guide the agent to receive float or start work.

### 2. Daily Operations

Current status: missing on mobile; manager-side float assignment exists on web/API.

Add:

- Receive float screen.
- Start working state after agent confirms float.
- Live work status: float remaining, expected cash, loans, collections, balance.
- Finish day screen showing float to return, collections, total cash, and variance before submission.
- Waiting for manager verification state.
- Cleared state after manager closes/accepts return.

API needed:

- `GET /agent-operations/today`
- `POST /agent-operations/receive-float`
- `POST /agent-operations/finish-day`
- realtime events for float assigned, float received, return submitted, manager verified, day cleared.

Acceptance:

- Agent cannot issue a loan or collect repayments before receiving assigned float if business rules require it.
- Agent cannot finish day with missing required cash fields.
- Manager web view sees the submitted return immediately.
- Day cannot be edited after manager clearance.

### 3. Operational Wallet

Current status: missing.

Add:

- Opening float.
- Current float.
- Collections held.
- Expected return.
- Cash difference.
- Manager verification status.
- Wallet history by day.

Acceptance:

- Wallet reconciles with Daily Operations and manager close-day calculations.
- Variance is obvious before the agent submits day-end return.

## Phase 2: Field Work Core

Purpose: make customer, loan, and collection work complete and easy in the field.

### 4. Customers Module

Current status: partial through Search, Client Details, and New Customer screen.

Add:

- Customers tab with filters: Search, Today's Visits, Near Me, Overdue, New Customer, Inactive, Archived.
- Customer profile: photo, NIN, phone, address, loans, repayment history, guarantors, collateral, notes, documents, GPS.
- Better customer creation with photo, GPS, national ID, business/collateral information, and documents.
- Customer archive/inactive behavior if supported by API.

API needed:

- Customer list endpoint optimized for mobile filters.
- Customer visit summary and GPS fields.
- Customer document list with preview URLs.

Acceptance:

- Agent can find a customer in three taps or less.
- Customer details show all loan and document context needed before field action.
- New customer creation validates duplicates by phone and national ID.

### 5. Loan Module

Current status: partial. New loan application exists, but the broader loan workspace is missing.

Add:

- Loan workspace with: New Loan, Loan Calculator, Loan History, Pending Approval, Approved, Rejected, Disbursed, Closed, Overdue.
- Ability to choose existing borrower or create a new borrower during application.
- Loan application fields: customer, amount, purpose, duration, repayment frequency, guarantor, collateral, documents, GPS, photos, signature.
- Manager notification immediately after submission.

API needed:

- Mobile loan list grouped by status.
- Loan calculator endpoint or shared client-side calculation from loan products.
- Existing borrower selection endpoint.

Acceptance:

- Submitted loans appear on manager web without refresh lag.
- Agent can reopen incomplete draft safely.
- Loan products from web settings drive the available loan types.

### 6. Collections Module

Current status: partial through repayment list, due today, search, and record repayment.

Add:

- Collection tabs: Today's Due, Tomorrow, Overdue, Paid, Missed, Partially Paid.
- Collection form fields: amount, receipt, payment method, reference, notes, photo.
- Immediate receipt generation after payment.
- Strong handling for partial payments and overpayments.

API needed:

- Due tomorrow and overdue endpoints or filters.
- Receipt document endpoint.
- Payment photo upload.

Acceptance:

- Receipt is available immediately after successful payment.
- Cash collected updates wallet and manager web dashboard.
- Duplicate payment submission is blocked by idempotency key.

### 7. Expense Recording

Current status: manager web can record branch expenses; agent mobile expense flow missing.

Add:

- New expense form: fuel, transport, parking, lunch, airtime, other.
- Receipt/photo required based on category or amount.
- Manager approval state.
- Expense list by day.

API needed:

- `POST /agent-expenses`
- `GET /agent-expenses/today`
- manager approval endpoints/events.

Acceptance:

- Submitted expenses reduce expected return only after approved if the business rule requires approval.
- Expense photos are previewable on manager web.

## Phase 3: Movement, Tasks, and Visits

Purpose: organize the agent's day and make field presence auditable.

### 8. Route Planner

Current status: missing.

Add:

- Suggested visit order based on GPS, due dates, overdue priority, and distance.
- Manual reorder.
- Save route for the day.

API needed:

- Route suggestion endpoint.
- Customer coordinates and due status.
- Saved daily route endpoint.

Acceptance:

- Agent can generate a morning route.
- Route excludes customers outside the agent's branch/territory.

### 9. Maps

Current status: missing.

Add:

- Customers near me.
- Today's route.
- Branch location.
- Current location.
- Tap customer to navigate.

Dependencies likely needed:

- `geolocator`
- `google_maps_flutter` or another approved map provider
- `url_launcher`

Acceptance:

- Permission-denied and GPS-off states are handled cleanly.
- No customer from another branch appears.

### 10. Tasks

Current status: missing.

Add:

- Today's tasks.
- Task types: visit customer, collect agreement, deliver cash, verify customer, take property photos, attend meeting.
- Complete, reschedule, note, attach photo.

API needed:

- Task CRUD for managers.
- Agent task update endpoints.
- Task assignment notifications.

Acceptance:

- Manager can assign a task on web and agent sees it.
- Completed task appears in manager activity and agent timeline.

### 11. Calendar

Current status: missing.

Add:

- Today's collections.
- Tomorrow.
- Meetings.
- Training.
- Leave.
- Birthdays.
- Branch events.

Acceptance:

- Calendar opens from Home and Tasks.
- Collection events match repayment schedule.

### 12. Customer Visit Tracking

Current status: missing.

Add:

- Check in.
- GPS and time capture.
- Optional photo.
- Notes.
- Outcome.
- Follow-up date.
- Visit history on customer profile.

API needed:

- `POST /customer-visits`
- `GET /customers/:id/visits`
- manager-side visit visibility.

Acceptance:

- Visit appears in timeline and customer profile.
- Follow-up creates a task/calendar item.

## Phase 4: Communication and Alerts

Purpose: remove WhatsApp dependency.

### 13. Notifications

Current status: missing.

Add:

- Notification center.
- Notification types: loan approved, loan rejected, manager message, customer paid, new assignment, float received, day cleared, reminder.
- Read/unread state.
- Push notification support later.

API needed:

- Notifications list and mark-read endpoint.
- Realtime notification events.

Acceptance:

- Notification count on Home is accurate.
- Tap notification opens the related loan/customer/task/day.

### 14. Messages

Current status: missing.

Add:

- Internal chat with manager, supervisor, and support.
- Attach customer/loan/task reference.
- No external WhatsApp dependency.

API needed:

- Conversation and message endpoints.
- Realtime message delivery.
- Read receipts.

Acceptance:

- Manager and agent can discuss a loan/customer with context attached.

## Phase 5: Verification and Documents

Purpose: improve KYC quality and reduce fraud.

### 15. Identity Verification

Current status: partial in loan application applicant verification.

Add:

- Standalone NIN verification flow.
- Fetch/confirm name where verification provider is available.
- Selfie capture.
- ID front/back capture.
- Verification status in customer profile.

Acceptance:

- Duplicate national ID is blocked before loan issuance.
- Verification evidence is stored and visible to managers.

### 16. Document Scanner

Current status: basic camera/file upload exists in loan application.

Add:

- Scanner types: National ID, Agreement, Collateral, Receipt, Business License, Utility Bill.
- Auto crop.
- OCR.
- Compression before upload.
- Document preview after upload.

Dependencies likely needed:

- Camera/document scanner package after review.
- OCR provider decision.

Acceptance:

- Uploaded documents are visible on both mobile and web with business names, not storage IDs.

### 17. Digital Signature

Current status: present in loan application.

Improve:

- Customer signature.
- Agent signature.
- Guarantor signature where required.
- Agreement PDF generation and stored document reuse.

Acceptance:

- The same generated agreement can be reopened without regenerating.
- Signatures are aligned correctly in PDF.

## Phase 6: Performance, Safety, and Settings

### 18. Performance Dashboard

Current status: missing.

Add:

- Collections percentage.
- Loans count.
- Customers count.
- Target progress.
- Ranking.
- Commission.

Acceptance:

- Values reconcile with manager reports.

### 19. Emergency Features

Current status: missing.

Add:

- SOS.
- Call manager.
- Nearest branch.
- Fraud report.
- Incident report.
- App diagnostics.

Acceptance:

- Emergency action records location/time when permitted.
- Manager receives alert.

### 20. Profile

Current status: partial.

Add:

- Employee ID.
- Branch.
- Role.
- Documents.
- Leave balance.
- Training.
- Password.
- Device management.

Acceptance:

- Agent can update only allowed personal information.
- Device management protects account security.

### 21. Settings

Current status: minimal.

Add:

- Dark mode.
- Language.
- Biometrics.
- Notifications.
- Offline storage.
- Sync.
- About.

Acceptance:

- Settings are non-technical and safe for field users.

### 22. Biometrics

Current status: future.

Add later:

- Face unlock.
- Fingerprint unlock.
- Passkey support.

Acceptance:

- Biometrics never replace server authorization.

### 23. AI Assistant

Current status: future.

Add later:

- Who should I visit first today?
- Which customers are highest risk?
- Show overdue customers within 2 km.
- Summarize my performance this week.
- How much float should I still have?

Acceptance:

- AI answers only from the agent's permitted branch scope.

## Offline Mode Plan

Current status: partial naming only; no strong offline queue confirmed.

Required:

- Local encrypted queue for repayments, visits, expenses, loan drafts, media metadata, and task updates.
- Idempotency key per write.
- Sync worker with retry/backoff.
- Conflict handling rules.
- Clear sync states: saved offline, syncing, synced, failed.
- Manager web must show only synced data.

First offline priority:

- Repayments.
- Customer visits.
- Expenses.
- Loan drafts and media uploads.

Acceptance:

- Agent can record a repayment without internet.
- When internet returns, repayment syncs once and produces one receipt.
- Failed sync shows clear recovery action.

## Operations Timeline

This should become the audit spine of the agent app.

Timeline examples:

- Float received.
- Customer verified.
- Loan application submitted.
- Repayment collected.
- Expense recorded.
- Loan approved.
- Returned to branch.
- Manager verified cash.
- Day closed.

API needed:

- event-backed `GET /agent-timeline/today`
- timeline events from operations, customers, loans, collections, expenses, visits, tasks, and messages.

Acceptance:

- Agent can review their day without writing an end-of-day report.
- Manager can see the same timeline from web.

## Backend Work Needed

Add or expand modules with proper boundaries:

- `agent-office` for mobile dashboard aggregate.
- `agent-operations` for receive float, work status, finish day, and clearance.
- `agent-wallet` or operations wallet contracts.
- `customer-visits`.
- `tasks`.
- `routes`.
- `notifications`.
- `messages`.
- `agent-expenses`.
- `documents-scanner` or expansion of storage/documents module.
- `agent-timeline`.

Each module must include:

- Controller.
- Service.
- Repository.
- DTOs/contracts.
- Permissions.
- Events.
- Audit/outbox.
- Tests.

## Build Order

1. Refactor mobile shell navigation to `Home`, `Customers`, `Operations`, `Tasks`, `Profile`.
2. Add agent daily operations read screen using existing float/operations data.
3. Add receive-float and finish-day flows.
4. Add operational wallet.
5. Add Customers tab and improved customer profile.
6. Upgrade Collections into its own Operations submodule with receipt view.
7. Upgrade Loans into its own Operations submodule with calculator and status lists.
8. Add customer visit tracking.
9. Add agent expenses with photo upload.
10. Add tasks.
11. Add notifications center.
12. Add route planner and maps.
13. Add offline queue and sync worker for repayments, visits, expenses, and loan drafts.
14. Add document scanner/OCR.
15. Add messages.
16. Add performance dashboard.
17. Add emergency tools.
18. Add biometrics and AI assistant after the core office is stable.

## Definition of Done

A module is complete only when:

- It works against live API data.
- It has no mock production data.
- It handles loading, empty, error, offline, and expired-session states.
- It is branch-scoped and permission-checked.
- It writes audit/outbox events for important actions.
- It has focused tests for the risky business rules.
- It is visible in the manager web app where managers need oversight.
- It is usable on small Android phones without clipped text or broken layouts.
