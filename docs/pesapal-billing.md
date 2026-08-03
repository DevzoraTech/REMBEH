# Pesapal Pro subscriptions

REMBEH bills **per branch** after an organisation-wide free trial.

## Product rules

- New organisations get a **30-day free trial** covering all current and future branches.
- After the trial, each branch needs **Pro** monthly. Current charged amount is **UGX 30,000** (Pesapal merchant default limit). Product target is **UGX 150,000** once Pesapal raises the limit.
- Unpaid branches enter a **2-day grace** period with reminders, then lock **that branch only**.
- Owners pay from **Subscription** (`/owner/subscription`) via Pesapal hosted checkout (mobile money + cards).

## Environment

Set these on the API host (never commit secrets):

```bash
PESAPAL_CONSUMER_KEY=…
PESAPAL_CONSUMER_SECRET=…
PESAPAL_ENV=live          # or sandbox
PESAPAL_IPN_URL=https://rembeh-api.antikra.com/api/v1/billing/pesapal/ipn
PESAPAL_CALLBACK_URL=https://rembeh-api.antikra.com/api/v1/billing/pesapal/callback
WEB_APP_URL=https://rembeh.antikra.com
# Optional if you already registered an IPN in the Pesapal dashboard:
# PESAPAL_IPN_NOTIFICATION_ID=…
```

## Pesapal dashboard URLs

| Purpose | URL |
|--------|-----|
| IPN (GET) | `https://rembeh-api.antikra.com/api/v1/billing/pesapal/ipn` |
| Browser callback | `https://rembeh-api.antikra.com/api/v1/billing/pesapal/callback` |

After payment, Pesapal redirects the owner to  
`https://rembeh.antikra.com/owner/subscription?paid=1&branch=<branchId>`.

## API routes

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/v1/billing/summary` | Owner (`billing.manage`) |
| POST | `/api/v1/billing/branches/:branchId/checkout` | Owner (`billing.manage`) |
| GET | `/api/v1/billing/my-branch` | Any signed-in user (manager lock banner) |
| GET | `/api/v1/billing/pesapal/ipn` | Public (Pesapal) |
| GET | `/api/v1/billing/pesapal/callback` | Public (Pesapal redirect) |

## Deploy notes

1. Apply Prisma migration `20260803120000_billing_subscriptions`.
2. Set Pesapal env vars on the API EC2 instance and restart the API.
3. Confirm IPN registration succeeds on first checkout (or paste `PESAPAL_IPN_NOTIFICATION_ID`).
4. Existing tenants get `billing.manage` backfilled for the Account Owner role on API boot.
