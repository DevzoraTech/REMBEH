# Contabo REMBEH deployment

The staging web and API are running on the VPS using `rembeh_stagecopy` and the separate `antikra-rembeh-staging` object bucket. Traefik is the shared HTTPS entry point; PostgreSQL is private. The authenticated web route and API/database health have been checked. Do not point staging at the AWS production database.

Build from a reviewed Git commit at the repository root:

```sh
docker build -f deploy/contabo/Dockerfile.api -t antikra/rembeh-api:RELEASE_ID .
docker build -f deploy/contabo/Dockerfile.web --build-arg NEXT_PUBLIC_API_URL=https://staging-api.antikra.com/api/v1 -t antikra/rembeh-web:RELEASE_ID .
```

Use `/srv/antikra/services/rembeh/api`, `web`, and `releases` for the deployment bundle and immutable release references. The API environment belongs in `/srv/antikra/services/rembeh/secrets/api.env` with mode `600`; never commit it. The Traefik candidate must replace the existing staging test route atomically after smoke tests. The current proxy uses the **file provider**, not Docker label discovery.

On 29 October 2026 the frozen AWS production database was restored to `rembeh_prod` on the VPS and the web, API and download domains were pointed to Contabo. Source and target control totals matched after restore; all 5,601 source objects matched the target by size and MD5. The final RDS snapshot is `rembeh-final-cutover-20261029`, and the final dump SHA-256 is `5d8315e3b8b7fbdbfab8dd960f40e6a689503cbb9e4eba2259e6e62bf288773e`. The AWS `rembeh-api` service is stopped and disabled. Never restart it as a writable primary while the VPS is live. The preproduction API was stopped before the restore.

The app uses Prisma migrations. The staging API is running against a restored copy with matching core counts and migration count. The staging object bucket had 5,517 objects and 6,732,612,298 bytes when copied; new AWS writes after that point require a final sync. Staging has no production payment, email or Firebase credentials. Sign-in, media access and database-backed workflows still need end-to-end user acceptance testing. Do not run migrations against the copy without review.

Set `DISABLE_SCHEDULED_JOBS=1` for this staging copy. Do not provide production SMS, payment, Firebase or object-storage credentials to staging. The web staging route uses HTTP Basic authentication; the API retains application authentication so cross-origin browser requests work.

The `rembeh_stage_app` role has SELECT, INSERT, UPDATE and DELETE on the 75 restored public tables, but no schema/database CREATE privileges. It can change staging data only; the original archive is retained for a reset. Test users should expect their staging changes to be discarded when the copy is refreshed. Scheduled jobs remain disabled, SMS is mocked, and production provider credentials are absent.

`compose.production-candidate.yaml` runs the production API and web using the mode-600 EC2 environment snapshot plus Contabo overrides and separately mounted Firebase credentials. The active image tag is recorded in `production-release.env`. Scheduled jobs are enabled. APK object keys are served using signed object-storage URLs; the static APK files remain available for older direct links. The release upload hotfix is layered on the reviewed production image using `Dockerfile.api-release-hotfix`; the source fix must be included in subsequent full image builds.

PostgreSQL WAL archiving and encrypted pgBackRest backups use `antikra-db-backups`, with daily full and hourly incremental timers. A named-point recovery was rehearsed in an isolated container; monitoring checks backup freshness, WAL errors, service health, disk space and certificate expiry, and alerts go to `admin@antikra.com`. The recovery credentials must also be held securely off the VPS. The imported production TLS certificates expire on 25 November 2026; automatic renewal of these imported certificates has not yet been verified and must be resolved before expiry.

The independent Payments service has its own database and container. Its production container is healthy, but REMBEH is not yet registered as a client and the Flutterwave dashboard must keep its existing REMBEH webhook until event delivery and reconciliation have been tested. The shared web-hosting layout under `web-hosting/` serves the REMBEH static marketing site and provides a pattern for additional isolated apps.
