# Deploy scripts

Full production guide (DNS, GitHub secrets, deploy key, auto-deploy): **[`docs/deploy.md`](../docs/deploy.md)**.

## DNS (quick)

| Host | Type | Value |
|------|------|-------|
| `rembeh-api.antikra.com` | A | `13.63.130.241` |
| `rembeh.antikra.com` | A | `13.63.130.241` |

Optional: `www.rembeh.antikra.com` CNAME → `rembeh.antikra.com`.  
Web and API are both **HTTPS** (separate nginx `server_name`s; see `deploy/nginx/`).

## GitHub Actions

Workflows (push to `main` + path filters, or manual `workflow_dispatch`):

- `.github/workflows/deploy-api.yml` — API
- `.github/workflows/deploy-web.yml` — Web

**Secrets:** `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`, optional `EC2_REMOTE_DIR`.  
App secrets stay on the server (`.env`); never in GitHub. Private repo: add a read-only **deploy key** on EC2 (see `docs/deploy.md`).

## Manual: API → EC2

```bash
# From your Mac (PEM key + local .env for first-time / env sync)
./scripts/deploy-api-ec2.sh

# Keep existing server .env (same as CI)
SKIP_ENV_UPLOAD=1 ./scripts/deploy-api-ec2.sh
```

Env overrides: `EC2_HOST`, `EC2_USER`, `EC2_KEY` (path) or `EC2_SSH_KEY` (PEM contents), `EC2_REMOTE_DIR`, `DEPLOY_BRANCH`, `REPO_URL`.

On the server only:

```bash
bash /home/ubuntu/rembeh/scripts/deploy-api-ec2.sh on-server
```

Deploy strips static `S3_*` keys so the instance uses an **IAM role** — see `scripts/aws/README-ec2-iam.md`.

Health:

```bash
curl https://rembeh-api.antikra.com/api/v1/platform/health
```

## Manual: Web → EC2

Builds `apps/web` with `NEXT_PUBLIC_API_URL=https://rembeh-api.antikra.com/api/v1`, runs via `rembeh-web.service`, installs `deploy/nginx/*.conf` via `ensure-nginx-web.sh` (HTTPS → `:3000`), and smokes `/dashboard`.

```bash
./scripts/deploy-web-ec2.sh

# On server
bash /home/ubuntu/rembeh/scripts/deploy-web-ec2.sh on-server

# Nginx-only repair (no rebuild)
bash /home/ubuntu/rembeh/scripts/ensure-nginx-web.sh
```

Live: `https://rembeh.antikra.com/`.
