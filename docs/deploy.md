# REMBEH production deploy

EC2 host: `16.170.166.117` · Repo: `https://github.com/DevzoraTech/REMBEH.git` · App dir: `/home/ubuntu/rembeh`

## DNS records

Add these in your DNS provider for `antikra.com`:

| Host | Type | Value |
|------|------|-------|
| `rembeh-api.antikra.com` | A | `16.170.166.117` |
| `rembeh.antikra.com` | A | `16.170.166.117` |

Optional:

| Host | Type | Value |
|------|------|-------|
| `www.rembeh.antikra.com` | CNAME | `rembeh.antikra.com` |

### TLS / HTTPS

| Site | Scheme | Notes |
|------|--------|--------|
| API | **HTTPS** | `https://rembeh-api.antikra.com` — Let's Encrypt on the host |
| Web | **HTTPS** | `https://rembeh.antikra.com` — Let's Encrypt via `certbot --nginx`; HTTP → HTTPS redirect |

Renewal is handled by certbot's timer. Optional `www.rembeh.antikra.com` needs a DNS CNAME before it can be added to the web cert.

Health check:

```bash
curl https://rembeh-api.antikra.com/api/v1/platform/health
curl -sI https://rembeh.antikra.com | head -20
curl -sI http://rembeh.antikra.com | head -10   # expect 301 → https
```

---

## GitHub Actions auto-deploy

On every push to `main` (path-filtered):

| Workflow | Paths | Action |
|----------|-------|--------|
| [`.github/workflows/deploy-api.yml`](../.github/workflows/deploy-api.yml) | `services/api/**`, root `package.json` / `package-lock.json`, deploy scripts | SSH → `git pull` → build API → restart `rembeh-api` |
| [`.github/workflows/deploy-web.yml`](../.github/workflows/deploy-web.yml) | `apps/web/**`, root package files, deploy scripts | SSH → `git pull` → build Next.js → restart `rembeh-web` + reload nginx |

Both support **Actions → Run workflow** (`workflow_dispatch`) for a manual redeploy.

### GitHub secrets to add

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Required | Example / notes |
|--------|----------|-----------------|
| `EC2_HOST` | yes | `16.170.166.117` |
| `EC2_USER` | yes | `ubuntu` |
| `EC2_SSH_KEY` | yes | Full PEM private key for SSH into EC2 (contents of `rembeh-key-pair.pem` or a dedicated deploy user key). Include `-----BEGIN…-----` / `-----END…-----` lines. |
| `EC2_REMOTE_DIR` | no | Defaults to `/home/ubuntu/rembeh` if unset |

**Do not** put `.env`, `DATABASE_URL`, S3 keys, or RDS passwords in GitHub. Those stay only on the EC2 host at `/home/ubuntu/rembeh/.env`.

### How auto-deploy works

1. Push lands on `main` and matches a workflow path filter.
2. GitHub runner loads `EC2_SSH_KEY` into `ssh-agent`.
3. Runner SSHs to EC2 and in `/home/ubuntu/rembeh`:
   - `git fetch` + `git reset --hard origin/main` (keeps `.env`, `node_modules`, `dist`, `.next`)
   - runs `scripts/deploy-*-ec2.sh on-server` (install, build, systemd restart)
4. App secrets are read from the existing server `.env` / IAM instance role (S3).

### Enable

1. Merge/push the workflow files to `main` (or merge a PR that contains them).
2. Add the secrets above.
3. Complete **EC2 one-time setup** (below) so `git fetch` works.
4. Trigger with a push under the path filters, or **Actions → Deploy API/Web → Run workflow**.

---

## EC2 one-time setup (deploy key)

If the GitHub repo is **private**, HTTPS `git fetch` on EC2 will fail without credentials. Prefer a **read-only deploy key**:

### 1. Create a key on the EC2 host

```bash
ssh -i services/rembeh-key-pair.pem ubuntu@16.170.166.117
ssh-keygen -t ed25519 -C "rembeh-ec2-deploy" -f ~/.ssh/rembeh_deploy_ed25519 -N ""
cat ~/.ssh/rembeh_deploy_ed25519.pub
```

### 2. Add the public key on GitHub

GitHub → `DevzoraTech/REMBEH` → **Settings → Deploy keys → Add deploy key**

- Title: `EC2 rembeh production`
- Key: paste the `.pub` contents
- Leave **Allow write access** unchecked (read-only)

### 3. Point the clone at SSH and use the key

```bash
cd /home/ubuntu/rembeh
git remote set-url origin git@github.com:DevzoraTech/REMBEH.git

# SSH config so git uses the deploy key
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/rembeh_deploy_ed25519
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

ssh -T git@github.com   # expect: successfully authenticated
git fetch origin
```

Alternative (less ideal): a fine-scoped PAT in `GH_TOKEN` used only on the server (`git` credential helper). Prefer deploy keys; do not store PATs in GitHub Actions for this flow.

Also ensure:

- `/home/ubuntu/rembeh/.env` exists (DATABASE_URL, CORS, empty S3 static keys — see `scripts/aws/README-ec2-iam.md`)
- IAM role `rembeh-ec2-api` attached for S3
- Security groups: inbound **80** (web), **443** (API nginx/certbot), SSH **22** from your IP / GitHub is not needed inbound from GitHub (outbound SSH from runner → EC2 **22**)
- Node 22+ (deploy scripts install if missing)

---

## Manual fallback

From a laptop with the PEM key and (for API env sync) a local `.env`:

```bash
# API — pull + optional .env upload + build/restart
./scripts/deploy-api-ec2.sh

# API — CI-style (keep server .env)
SKIP_ENV_UPLOAD=1 EC2_SSH_KEY="$(cat services/rembeh-key-pair.pem)" ./scripts/deploy-api-ec2.sh

# Web
./scripts/deploy-web-ec2.sh
```

On the server directly:

```bash
cd /home/ubuntu/rembeh
git fetch origin && git reset --hard origin/main
bash scripts/deploy-api-ec2.sh on-server
bash scripts/deploy-web-ec2.sh on-server
```

---

## Related

- Script usage notes: [`scripts/README.md`](../scripts/README.md)
- EC2 IAM for S3: [`scripts/aws/README-ec2-iam.md`](../scripts/aws/README-ec2-iam.md)
