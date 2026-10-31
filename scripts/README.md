# REMBEH Operations

Production runs on the Contabo VPS, not the former EC2 host. See [the infrastructure diagram and current status](../deploy/contabo/INFRASTRUCTURE.md) before operating it.

## Production Domains

| Service | URL |
| --- | --- |
| Web | `https://rembeh.antikra.com` |
| API | `https://rembeh-api.antikra.com/api/v1` |
| Landing and older APK links | `https://get.rembeh.antikra.com` |
| Independent Payments | `https://payments.antikra.com` (checkout disabled pending integration) |

## Reviewed Deployment

`deploy-contabo.sh` deploys **already-built and reviewed** API and web images carrying the same immutable release tag. It checks the recorded current release, required images, Compose configuration and database backup health. It does not build images or run migrations. It requires the existing SSH host key, SSH identity and an operator able to run sudo on the VPS.

```sh
bash scripts/deploy-contabo.sh --check NEW_RELEASE
bash scripts/deploy-contabo.sh --apply NEW_RELEASE --expected CURRENT_RELEASE
```

Apply only after staging tests and a reviewed, backward-compatible migration plan. If a deployment or public health check fails, inspect the running containers and database before taking a rollback decision. A code rollback does not undo schema or financial changes. A restricted deployment identity, protected GitHub environment and a complete automated build/deploy pipeline are still to be set up; the previous EC2 workflows are disabled on GitHub.

## Android Releases

Build and verify an APK without publishing:

```sh
bash scripts/build-mobile-release-contabo.sh --version 2.0.64 --build 93
```

With a separately issued `workspace.update` token, `--publish` uploads through the production API and registers an **inactive** release for review in Control Center. Add `--force` only when the release must be mandatory. Do not put the token in source code, shell history or chat. `scripts/release-mobile-apk.sh` can register an already-built APK, but the operator must verify its version, signature and contents first. Object-key releases use signed Contabo downloads; existing static APK URLs remain available.

## Database And Health

On the VPS, `systemctl list-timers 'antikra-*'` shows scheduled backups and checks. `sudo systemctl start antikra-postgres-health.service antikra-services-health.service` runs the checks immediately. Backups are encrypted, stored off the VPS, and have passed a point-in-time restore rehearsal. Preserve recovery credentials independently of the VPS. The imported production certificates currently expire on 25 November 2026; automated renewal remains to be verified.

## Retired AWS Tools

The scripts named `*-ec2.sh`, the old forced mobile-release builder, and the S3 acceleration helper are retained for historical rollback analysis and fail closed by default. `ALLOW_RETIRED_AWS=yes` is an emergency override, not a routine deployment method; it must not be used to restart the old API or write to the old database while Contabo is live. The old AWS GitHub deployment workflows were manually disabled and must not be re-enabled. Switching back after VPS writes requires a new freeze and a reviewed data reconciliation plan.
