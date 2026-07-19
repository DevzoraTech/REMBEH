# Deploy scripts

## API → EC2 (GitHub)

Deploys from `https://github.com/DevzoraTech/REMBEH.git` onto the Ubuntu host.

```bash
# From your Mac (needs services/rembeh-key-pair.pem + local .env)
./scripts/deploy-api-ec2.sh
```

Optional env overrides:

- `EC2_HOST` (default `16.170.166.117`)
- `DEPLOY_BRANCH` (default `main`)
- `REPO_URL`

Secrets (`.env`) are scp’d; they are never committed. Deploy strips `S3_ACCESS_KEY` / `S3_SECRET_KEY` so the instance uses an **IAM role** for S3 — see `scripts/aws/README-ec2-iam.md`.

After deploy:

1. Open **inbound TCP 4000** on the instance security group
2. Attach IAM role `rembeh-ec2-api` (S3 policy in `scripts/aws/`)
3. Allow EC2 → RDS **5432** on the RDS security group

Health (public HTTPS API):

```bash
curl https://rembeh-api.antikra.com/api/v1/platform/health
```

`EC2_HOST` remains the SSH/deploy target; clients should use the HTTPS domain above.
