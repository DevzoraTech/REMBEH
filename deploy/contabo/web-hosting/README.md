# ANTIKRA web hosting

Traefik is the shared HTTPS entry point. Each application has a separate container, release directory, and explicit file-provider route. Static sites use a read-only Nginx container; server-rendered apps keep their own runtime container. Do not place unrelated apps in the REMBEH container or give static sites database credentials.

The REMBEH marketing site is built from `website/` with `npm ci && npm run build`. Deploy its `out/` directory to `sites/rembeh/releases/<release-id>/`, verify `index.html`, then atomically update `sites/rembeh/current` to that release. The site is served by `compose.yaml`. The public preview route is `staging-site.antikra.com`. `traefik-rembeh-site.yaml` is the future production route for `get.rembeh.antikra.com`; keep it outside Traefik's active dynamic directory, and leave the existing AWS DNS target unchanged until cutover.

Android releases are stored separately under `sites/rembeh/apk/`, outside the `current` marketing-site symlink. The production API's `APK_PUBLIC_BASE_URL` remains `https://get.rembeh.antikra.com/apk`. Before DNS cutover, copy every still-supported release file from the old host and compare SHA-256 with the corresponding `app_releases` records; test full and ranged downloads through the candidate route.

For a future app, create its own Compose service and release directory, add an explicit Traefik router under the dynamic directory, verify the container directly on the private network, then point its DNS record to the VPS. Do not publish container ports. Pin reviewed images by immutable digest before production cutover, and keep a previous release for rollback.
