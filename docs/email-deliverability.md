# REMBEH email deliverability

Invitation and verification emails are sent through **Resend** from the Nest API (`services/api` → `NotificationsService`).

## Required production env (EC2 `/home/ubuntu/rembeh/.env`)

| Variable | Example | Purpose |
|----------|---------|---------|
| `WEB_APP_URL` | `https://rembeh.antikra.com` | Base URL for invitation accept links |
| `APP_WEB_URL` / `FRONTEND_URL` | (optional aliases) | Same as `WEB_APP_URL` if set |
| `RESEND_API_KEY` | `re_…` | Resend API key (never commit) |
| `EMAIL_FROM` or `OTP_EMAIL_FROM` | `auth@antikra.com` | From address (must be a verified Resend domain/sender) |
| `EMAIL_FROM_NAME` | `REMBEH` | Display name → `REMBEH <auth@antikra.com>` |
| `NODE_ENV` | `production` | Disables silent email stubs |

Invitation buttons resolve to:

`https://rembeh.antikra.com/staff-invitations/accept?token=…`

In **production**, if `RESEND_API_KEY` is missing or Resend returns an error, the API fails loudly (`503`) instead of pretending the email was sent. Development may return `delivered: false` and (for invites only) a temporary `acceptUrl` for local testing.

## Spam / inbox placement

Emails already use:

- Clear subjects (`REMBEH verification code`, `REMBEH invitation — {workspace}`)
- Multipart **text + HTML**
- Named From header
- Plain transactional wording (no “urgent / act now” spam patterns)
- Visible plain-text link under the HTML button

### DNS for the sending domain (antikra.com or your Resend domain)

In your DNS provider (and mirrored in the Resend dashboard → Domain):

1. **SPF** — authorize Resend’s senders (Resend shows the exact TXT value).
2. **DKIM** — add the CNAME/TXT records Resend provides for the domain.
3. **DMARC** — start with a monitoring policy, e.g.  
   `v=DMARC1; p=none; rua=mailto:dmarc@antikra.com`
4. Prefer a subdomain such as `mail.antikra.com` or use Resend’s onboarding domain records exactly as shown.

Until SPF/DKIM verify as green in Resend, messages may land in spam or be rejected.

## Quick checks

```bash
# On EC2 — confirm web URL (do not print secrets)
grep -E '^(WEB_APP_URL|APP_WEB_URL|FRONTEND_URL|EMAIL_FROM|EMAIL_FROM_NAME|NODE_ENV)=' /home/ubuntu/rembeh/.env

# After inviting a staff member, open the email and confirm the Accept button host is rembeh.antikra.com
```

## Related

- Deploy overview: [`deploy.md`](./deploy.md)
- Accept UI: `apps/web/src/app/staff-invitations/accept/page.tsx`
