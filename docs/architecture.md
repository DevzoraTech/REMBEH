# REMBEH Architecture

## Product Definition

REMBEH is not a single-purpose loan tool. It is a multi-tenant financial operations platform where each lending institution receives an isolated workspace with its own branches, users, customers, loans, collections, reports, and settings.

## Core Decisions

- Use a modular monolith first, with strong domain boundaries.
- Use a shared PostgreSQL database with mandatory `tenant_id` on every tenant-owned table.
- Treat modules as product capabilities that can be enabled, disabled, priced, and surfaced dynamically.
- Keep tenant isolation server-side. No API query should rely on the client to provide a trustworthy tenant filter.
- Emit domain events for every important action so notifications, audit logs, reports, and AI can subscribe later.
- Store files in S3-compatible storage so contracts, IDs, collateral media, receipts, and statements can move between local MinIO and cloud S3.

## Platform Shape

- Authentication: email, phone, OTP, passwords, future passkeys, and 2FA.
- Tenant core: workspace, branches, departments, roles, permissions, invitations, activation, and settings.
- Operations modules: customers, loans, guarantors, collateral, collections, transactions, cashiers, accounting, reports, notifications, files, audit logs, API, webhooks, and AI.
- Clients: Next.js web control center and one permission-driven Flutter mobile app.

## Tenant Boundary

Every persistent model that belongs to a company must include `tenant_id`. The API should derive the active tenant from the authenticated session and request context, then enforce it in repository/service helpers.

Recommended safety layers:

- Prisma extensions or repositories that require a tenant context.
- Database indexes starting with `tenant_id` for tenant-owned query paths.
- Future PostgreSQL Row Level Security for high-assurance enterprise deployments.
- Test fixtures that fail when queries omit tenant scope.

## Module Registry

Each module owns its permissions, routes, menu entries, events, and mobile surfaces. The frontend should request enabled modules and permissions from the API, then build navigation from that contract.

Example module groups:

- Core: dashboard, customers, users, branches.
- Lending: loans, guarantors, collateral, collections.
- Finance: cashiers, accounting, expenses.
- Communication: SMS, email, WhatsApp, push, in-app.
- AI: reports, fraud detection, recommendations, assistant.
- Enterprise: audit logs, API, webhooks, white label, SSO.

## Reliability Improvements

The first backend should include an event outbox table even before queues become complex. This prevents events like `loan.approved`, `payment.made`, or `employee.invited` from being lost if notification or reporting workers are temporarily down.

## Loan applications (field → console)

- **API:** `POST/PATCH/GET /api/v1/loan-applications`, verify-applicant, media presign/confirm, submit. Identity: `POST /api/v1/identity/verify-nin`.
- **Storage:** S3-compatible via `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`. Local MinIO bucket `rembeh-local`; production uses AWS S3 with the same client.
- **Smile ID:** Set `SMILE_ID_ENABLED=true` plus `SMILE_ID_PARTNER_ID`, `SMILE_ID_API_KEY`, `SMILE_ID_BASE_URL`, `SMILE_ID_CALLBACK_URL`. When disabled or keys missing, the API uses a logged stub so local flows work.
- **Realtime:** Socket.IO namespace `/realtime` (JWT in `auth.token`). Rooms `tenant:{id}` and `branch:{id}`. Events: `loan_application.submitted`, `loan_application.updated`, `loan_application.media_uploaded`.
- **Mobile permissions:** REMBEH shows a rationale dialog before camera / photos / files system prompts; permanently denied opens Settings.
- **Physical devices:** API listens on `HOST=0.0.0.0`. Mobile uses `--dart-define-from-file=dart_defines.dev.json` (see `apps/mobile/tool/sync_dev_host.sh`) so the phone hits your LAN IP. Set `S3_PUBLIC_ENDPOINT=http://<lan-ip>:9000` so MinIO presigned uploads are reachable from the device.
