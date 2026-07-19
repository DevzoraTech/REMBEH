# EC2 → S3 without access keys (IAM instance role)

The API on EC2 should use the **instance IAM role**. No `S3_ACCESS_KEY` / `S3_SECRET_KEY` in production `.env`.

## 1. Create role

1. IAM → Roles → **Create role**
2. Trusted entity: **AWS service** → **EC2**
3. Attach a custom policy (use `ec2-api-iam-policy.json`; change bucket name if needed)
4. Role name: `rembeh-ec2-api`

## 2. Attach to the instance

1. EC2 → instance `16.170.166.117` → **Actions** → **Security** → **Modify IAM role**
2. Select `rembeh-ec2-api` → Update

## 3. Production `.env` on the server

```env
S3_ENDPOINT=
S3_PUBLIC_ENDPOINT=
S3_BUCKET=rembeh-prod-bucket
S3_REGION=eu-north-1
# leave empty — SDK uses the instance role
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

Restart: `sudo systemctl restart rembeh-api`

## 4. RDS access from EC2

1. RDS → `rembeh-1` → **Connectivity** → VPC security group
2. Inbound rule: **PostgreSQL 5432** from the **EC2 instance security group** (preferred) or the EC2 private IP
3. Keep `DATABASE_URL` in `/home/ubuntu/rembeh/.env` (password stays in env; not in GitHub)

## 5. API public access

EC2 security group inbound: **TCP 4000** from `0.0.0.0/0` (or your app IPs).
