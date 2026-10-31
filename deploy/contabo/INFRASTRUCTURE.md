# ANTIKRA Production Infrastructure

Verified on 29 October 2026. This document distinguishes running infrastructure from planned capabilities; it is not a claim that every payment workflow is production-ready.

## Overall Architecture

```mermaid
flowchart TB
  users["REMBEH users<br/>Android, iOS and web"]
  admins["ANTIKRA operators<br/>SSH key + sudo"]
  github["GitHub source<br/>old EC2 workflows disabled"]
  dns["DNS: production and staging domains"]
  fw["Flutterwave v3<br/>existing REMBEH payment flow"]
  pesapal["Pesapal"]
  sms["Pahappa SMS"]
  email["Resend email"]
  firebase["Firebase Cloud Messaging"]
  object["Contabo Object Storage EU2<br/>application files and encrypted backups"]
  aws["AWS rollback only<br/>RDS snapshots + old EC2 API stopped"]

  subgraph VPS["Contabo VPS 84.247.184.219 - Ubuntu, Docker Compose"]
    firewall["UFW: inbound 22, 80, 443<br/>other inbound ports denied"]
    proxy["Traefik v3.6<br/>HTTPS, routing, certificate store"]
    subgraph EDGE["Docker network: antikra_proxy"]
      web["rembeh-web :3000<br/>production"]
      api["rembeh-api :4000<br/>production"]
      site["antikra-rembeh-site :8080<br/>landing page + legacy APK files"]
      payments["antikra-payments-api :4100<br/>checkout disabled"]
      stageweb["rembeh-stage-web :3000"]
      stageapi["rembeh-stage-api :4000"]
      paystage["antikra-payments-stage-api :4100"]
    end
    subgraph DATA["Private data networks"]
      pg["antikra-postgres 18.6 + pgBackRest<br/>no host-published database port"]
      redis["antikra-redis 7.4<br/>authenticated, 256 MB cache<br/>REMBEH rate limits only"]
    end
    timers["systemd timers<br/>full + incremental backups<br/>health, disk, WAL and certificate checks"]
  end

  users --> dns --> firewall --> proxy
  admins --> firewall
  proxy --> web & api & site & payments & stageweb & stageapi & paystage
  web --> api
  api -->|rembeh_private| pg
  stageapi -->|rembeh_private| pg
  api -->|rembeh_private, ACL| redis
  payments -->|payments_private| pg
  paystage -->|payments_private| pg
  api --> object & fw & pesapal & sms & email & firebase
  payments -. "future verified payment handover" .-> fw
  timers --> pg & redis & api & payments
  timers -->|failure alerts| email
  pg -->|encrypted WAL + backups| object
  aws -. "rollback source; never simultaneous writes" .-> pg
  github -. "reviewed releases only; replacement CI/CD pending" .-> VPS
```

## Domains And Services

| Domain | Route | Current purpose |
| --- | --- | --- |
| `rembeh.antikra.com` | Traefik to `rembeh-web:3000` | Production web app |
| `rembeh-api.antikra.com` | Traefik to `rembeh-api:4000` | Production API and existing Flutterwave/Pesapal callbacks |
| `get.rembeh.antikra.com` | Traefik to static site `:8080` | Landing page and previously published direct APK links |
| `staging.antikra.com` | Traefik to staging web | Protected by HTTP Basic authentication |
| `staging-api.antikra.com` | Traefik to staging API | Application authentication; separate staging database |
| `staging-site.antikra.com` | Traefik to static site | Landing-site preview |
| `payments.antikra.com` | Traefik to Payments `:4100` | Independent service; live checkout remains disabled |

Traefik uses the file provider under `/srv/antikra/infrastructure/proxy/traefik/dynamic`. Only Traefik publishes ports 80 and 443. PostgreSQL, Redis and application ports are not published to the host. SSH on port 22 is reachable publicly and should be restricted further where operationally possible. UFW and Docker networking must both be considered when reviewing exposure.

## Databases And Storage

```mermaid
flowchart LR
  api["REMBEH production API"] --> rp["rembeh_prod"]
  sa["REMBEH staging API"] --> rs["rembeh_stagecopy"]
  p["Payments production"] --> pp["payments_prod"]
  ps["Payments staging"] --> pst["payments_stage"]
  pg["One PostgreSQL 18 cluster"] --- rp & rs & pp & pst
  pg --- verify["rembeh_cutover_verify<br/>migration rehearsal copy"]
  pg --> wal["pgBackRest encrypted full/incremental backups + WAL"]
  wal --> bucket["antikra-db-backups /postgres"]
  api --> files["antikra-rembeh-files<br/>private uploads + release objects"]
  sa --> sfiles["antikra-rembeh-staging"]
```

Production and staging are separate databases and application roles but share the same PostgreSQL container and host. Both REMBEH environments share `rembeh_private`; both Payments environments share `payments_private`. This is logical isolation, not a separate host or high-availability cluster. The VPS and its object store are both Contabo dependencies. An independent-provider or off-region backup is still needed for provider-wide disaster recovery.

`rembeh_app` has runtime permissions; migrations use `rembeh_migrator`. Payments uses its own roles. Secrets are kept under service-specific `secrets/` directories and are not committed. The pgBackRest encryption credentials also need a secure, recoverable copy outside the VPS. Do not paste passwords, API keys or signed URLs into tickets or logs.

The final AWS export was frozen and verified before restore. Counts and financial control totals matched, and 5,601 object keys, sizes and MD5 hashes matched. RDS snapshot `rembeh-final-cutover-20261029` and the frozen AWS API provide rollback evidence, not a second live primary. Rollback after new VPS writes requires a new freeze and an explicit reverse-data migration or accepted data-loss decision.

## Protection And Operations

| Capability | Current state |
| --- | --- |
| PostgreSQL | `antikra/postgres-pgbackrest:18-2.60.0`; authenticated connections |
| Backup | Encrypted pgBackRest repository in `antikra-db-backups`; daily full, hourly incremental; seven full backups retained |
| Recovery | WAL archiving enabled; isolated named-point-in-time restore rehearsal passed on 29 October 2026 |
| Monitoring | systemd checks PostgreSQL, archive errors, recent backups, disk usage, production containers, API health, Redis and certificate expiry; email to `admin@antikra.com` |
| Redis | Private to `rembeh_private`, ACL-limited to rate-limit keys/commands, AOF persistence; no financial records stored there |
| TLS | Existing production certificates were copied securely and currently work. Automated renewal for those imported certificates is not yet verified; they expire on 25 November 2026. |
| Deployment | Images run from reviewed tags; old AWS GitHub deployment workflows are disabled. The new operator script checks image availability, backup health and the expected current tag. Full automated CI/CD is not yet configured. |
| Logs and resilience | Container logs and host services exist; centralized log retention, provider-independent disaster recovery, HA, comprehensive metrics and payment-specific operational alerts remain to be implemented. |

Redis currently emits a host memory-overcommit advisory; no global kernel setting was changed without assessing its effect on PostgreSQL and the other services.

## Payment Boundaries

```mermaid
flowchart LR
  app["Registered client app backend<br/>unique app ID + API credential + server IP allowlist"]
  central["ANTIKRA Payments<br/>intents, provider verification, ledger, signed outbox"]
  provider["Flutterwave"]
  receive["Client event receiver<br/>signature + idempotency + reconciliation"]
  app --> central --> provider
  provider -->|"proposed central webhook; not switched"| central
  central -->|"signed, retryable events; integration pending"| receive
  provider -->|"existing REMBEH webhook remains active"| rembeh["REMBEH billing API"]
```

The Payments process is reachable and has a separate database, but checkout is disabled and REMBEH is not yet onboarded as a verified client. Do not switch the Flutterwave dashboard webhook until existing REMBEH transactions are routed safely, signed events are durably consumed, replay/idempotency and provider verification are tested, and settlement/reconciliation procedures are operational. Existing provider callbacks must continue to work during any transition. Future applications receive separate identities only when registered; do not invent identities for applications that do not yet exist.

## Important Paths

| Path | Contents |
| --- | --- |
| `/srv/antikra/infrastructure/proxy/traefik/` | Proxy configuration, routes and certificate store |
| `/srv/antikra/infrastructure/postgres/` | PostgreSQL Compose, data, backup configuration and protected credentials |
| `/srv/antikra/infrastructure/redis/` | Redis Compose, ACL credentials and persistent rate-limit data |
| `/srv/antikra/infrastructure/backups/imports/` | Protected migration dumps, manifests and control totals |
| `/srv/antikra/services/rembeh/` | Production/staging Compose files, release selector and protected secrets |
| `/srv/antikra/services/payments/` | Independent Payments service and environment-specific secrets |
| `/srv/antikra/services/web-hosting/sites/rembeh/` | Static landing site and legacy APK files |

Operator deployment and release procedures are in [scripts/README.md](../../scripts/README.md). The masterplan describes the intended architecture; this file records the observed deployment and its outstanding gaps.
