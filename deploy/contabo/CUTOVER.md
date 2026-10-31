# REMBEH VPS cutover gate

Current live REMBEH web, API, and marketing DNS still point to AWS. The VPS has a protected pre-cutover API at `staging-api.antikra.com/preprod`, an empty `rembeh_prod` schema, a production web image with the final API URL, and a marketing-site container. The staging database is an older copy and must not become the production database.

## Before the maintenance window

- Confirm an off-server encrypted PostgreSQL backup, WAL/PITR recovery path, alert delivery, restore rehearsal, and available disk capacity. A healthy container is not proof of recoverability.
- Record the exact release images, source database identity, source/target PostgreSQL versions, DNS TTLs, object counts, financial control totals, and rollback owner.
- Keep the existing Flutterwave webhook on REMBEH. The independent Payments service is deployed but its checkout switch is off and REMBEH has not been registered as a client.

## During the maintenance window

1. Put the AWS application into a verified write freeze, including mobile/offline sync and background jobs. Confirm no new loan, repayment, payment, or file writes can be accepted.
2. Take a fresh consistent RDS dump and checksum it. Capture source table counts, migration history, and financial totals from the same frozen point.
3. Stop the pre-cutover API. Replace the schema-only `rembeh_prod` preparation with the fresh dump using the reviewed restore procedure; do not merge the old staging copy into it. Reapply the restricted runtime grants.
4. Copy the final AWS object-storage delta to `antikra-rembeh-files`. Compare keys, byte sizes, and representative content, then configure the production API for that bucket.
5. Start the production API from `compose.production-candidate.yaml` with scheduled jobs and outbound integrations held until smoke tests pass. Verify database health, authentication, borrowers, loans, repayments, reports, files, and financial control totals. Keep the AWS side frozen.
6. Activate the production web and API Traefik routes, then change `rembeh.antikra.com`, `rembeh-api.antikra.com`, and `get.rembeh.antikra.com` DNS to the VPS. Verify valid TLS, API routing, mobile sync, and a representative authorized workflow. Do not let both AWS and VPS accept writes.
7. Enable jobs and outbound integrations only after the final smoke test and rollback decision. Monitor errors, queues, storage, disk, and backup status continuously.

## Rollback boundary

Before the VPS accepts a new write, DNS can return to AWS while its write freeze is lifted. Once the VPS has accepted new financial writes, do not simply point DNS back to AWS: reconcile or replay those writes first, or restore an approved point in time. Keep the original AWS database and object bucket unchanged until the rollback window closes.

## Payments is a separate switch

The prepared webhook URL is `https://payments.antikra.com/webhooks/flutterwave`, but do not enter it in the Flutterwave dashboard yet. First implement and test REMBEH as a registered Payments client, durable signed-event consumption, duplicate protection, provider verification, reconciliation, backup/restore, and a controlled live-payment test. Only then enable `PAYMENTS_CHECKOUT_ENABLED=true` and switch the provider webhook. The existing REMBEH webhook must continue receiving current payment events until that handover is complete.
