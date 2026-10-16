# Production Performance And Cost Controls

REMBEH keeps the database as the source of truth for balances, transactions,
and reports. Device and server caches only avoid downloading data that has not
changed; they must be invalidated by a write or a realtime event.

## Already Applied In The Apps

- Mobile no longer probes the API every 12 seconds to decide whether it is online.
  Connectivity changes, app resume, and actual requests drive that decision.
- Mobile no longer refreshes the day, repayment list, marketing, and client index
  every 30 seconds while idle.
- Mobile no longer polls app-update status every 20 seconds. Release events and
  foreground resume are the refresh triggers.
- Repayment history opens with 30 rows and loads further pages only when asked.
- Report lists now transfer only report metadata, not every historical report
  snapshot. A saved daily report snapshot and PDF stay on the device and are
  reused only while their revision, status, generation time, and business date
  still match the server metadata. A changed report is downloaded individually
  and replaces its local copy atomically.
- API production logging excludes `debug` and `verbose` unless explicitly enabled.
  Slow successful request records are sampled; server errors are never sampled.

## Redis Role

Redis is now used for distributed counters on expensive snapshot/export reads.
It falls back to the in-process limiter for 30 seconds when Redis is unavailable.
Use Redis only for data that can be safely invalidated: rate limiting, short-lived
read coordination, authentication/session metadata, and background job locks.
Do not use Redis as the authority for cash, loan, repayment, or report values.

The application already accepts `REDIS_URL`. Run Redis on the existing EC2 host
or use ElastiCache only when high availability justifies its additional cost.
For a single current EC2 host, local Redis avoids a separate managed-cache bill:

```bash
sudo apt-get update
sudo apt-get install -y redis-server
sudo systemctl enable --now redis-server
redis-cli ping
```

Then set this only on `/home/ubuntu/rembeh/.env` and restart the API:

```env
REDIS_URL=redis://127.0.0.1:6379
```

Redis must be treated as optional. A Redis outage must fall back to direct,
authoritative database reads rather than blocking financial work.

## AWS Controls To Apply

1. CloudWatch Logs: set the REMBEH application log group retention to 7 or 14
   days. Use Standard class only for logs queried frequently; move archival logs
   to S3 or an Infrequent Access log group instead of retaining all debug output.
2. CloudWatch: create a monthly AWS Budget and Cost Anomaly Detection monitor
   for CloudWatch Logs, EC2, RDS, S3, and data transfer.
3. S3: add lifecycle rules for banking receipts and other uploads. Keep active
   records available, but expire incomplete multipart uploads after 7 days and
   transition old non-current object versions or unneeded generated APKs.
4. RDS: verify automated backup retention, snapshots, and storage autoscaling;
   do not keep duplicate manual snapshots without a retention decision.
5. EC2: retain the current single API process and local Redis before introducing
   additional always-on services. Monitor CPU, memory, connections, and API
   latency before scaling horizontally.

## Verification Before Enabling A Cache

For every cached endpoint, prove all four cases:

1. A read returns the latest committed value after a write.
2. A realtime event invalidates or replaces the relevant cached item.
3. A cache outage returns the database result without an error to the user.
4. Tenant and branch identifiers are part of every cache key.
