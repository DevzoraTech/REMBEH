# REMBEH

REMBEH is the ANTIKRA Mechanism financial operations platform for lending institutions. It is being built as a cloud-native, multi-tenant workspace system where lending, collections, users, branches, accounting, notifications, audit logs, and future AI features are modules.

## Workspace

- `apps/web` - Next.js control center for owners, admins, managers, auditors, and operations teams.
- `apps/mobile` - Flutter app for field agents, loan officers, cashiers, and branch teams.
- `services/api` - NestJS modular monolith API with tenant isolation, module registry, audit, events, and future Prisma/PostgreSQL persistence.
- `docs` - product and architecture decisions extracted from `foundation.md`.

## Local Commands

```bash
npm install
npm run dev:deps          # start Postgres + Redis
npm run prisma:migrate:deploy
npm run dev:api
npm run dev:web
cd apps/mobile && flutter run
```

Or start API dependencies and the API together:

```bash
npm run dev:stack
```

## Local Services

```bash
docker compose up -d
```

The local service stack provides PostgreSQL, Redis, MinIO, and Mailpit for development.

If login/register returns database errors (`ECONNREFUSED`), Postgres is not running — start it with `npm run dev:deps` first.

## Electronic signatures & S3 layout

Loan applications store media and signatures under hierarchical keys:

```
tenants/{tenantId}/loans/{loanApplicationId}/
  media/{mediaType}/{uuid}.{ext}
  signatures/{signerRole}/{uuid}/signature.png|strokes.json|metadata.json
  documents/SignedLoanAgreement-{version}.pdf
```

Mobile agents capture signatures with Syncfusion SignaturePad (see `apps/mobile/README.md` for license notes). API endpoints: `POST /loan-applications/:id/signatures/presign` and `.../confirm`. Deploy migration `20260719120000_loan_application_signatures` before using the feature in an environment.

