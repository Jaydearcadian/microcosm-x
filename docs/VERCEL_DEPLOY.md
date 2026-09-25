# Deploying the UI to Vercel

The app is two processes. Only the UI belongs on Vercel.

| Piece | Where it runs | Why |
| :--- | :--- | :--- |
| Charcoal UI (Next.js) | Vercel | stateless, static-friendly |
| REST + SSE API, persistence, indexer | this host, `microcosm-server.service` on `:8791` | owns `DATA_PATH`, the Space store, and the OKX X Layer indexer |

The UI never talks to the API cross-origin. `next.config.mjs` rewrites `/api/:path*` to
`MICROCOSM_API_PROXY`, so the browser only ever calls the same origin it loaded the page
from. That keeps cookies first-party, avoids mixed content, and means CORS never applies
to page traffic.

## Vercel project settings

- **Root directory:** `apps/charcoal`
- **Framework preset:** Next.js (auto-detected)
- **Install command:** `npm install` (run from the repo root, or `npm ci` with the root lockfile)
- **Build command:** `npx next build`
- **Output:** Next.js default (do not switch to `export`; the app has a dynamic route)

## Environment variables

Set exactly these. Do not set `NEXT_PUBLIC_MICROCOSM_API`: leaving it unset is what makes
the browser use same-origin `/api/...`, which is the whole point.

```
MICROCOSM_API_PROXY=http://52.40.133.66:8791
```

Optional, only if you later want the browser to call the API directly:

```
NEXT_PUBLIC_MICROCOSM_API=https://<api-host>
```

## Server side

`CORS_ORIGIN` is a comma-separated allowlist. Add the Vercel domain so direct API calls
and EventSource streams work even if you later switch the client to an absolute URL:

```
CORS_ORIGIN=http://localhost:3000,https://<your-app>.vercel.app
```

Then:

```bash
sudo systemctl restart microcosm-server
```

## Verify after deploying

```bash
# 1. the UI is up
curl -s -o /dev/null -w "%{http_code}\n" https://<your-app>.vercel.app/app

# 2. the UI's own proxy reaches the API
curl -s https://<your-app>.vercel.app/api/health

# 3. a Space-scoped read-only route works through the proxy
curl -s https://<your-app>.vercel.app/api/spaces/space-procurement-001/capability-manifest

# 4. the indexer reports through the proxy
curl -s https://<your-app>.vercel.app/api/spaces/space-procurement-001/indexer
```

## What will not work from Vercel

- **Anything needing the API's filesystem.** `DATA_PATH` and its snapshots live on this
  host. The Vercel deployment is a viewer and client; the API remains the system of record.
- **Server-Sent Events may be buffered.** The rewrite streams `/events`, but the platform
  in front of your app decides whether to flush incrementally. If the Audit view's live
  stream stalls, the fix is an API route on Vercel that proxies with
  `Cache-Control: no-cache` and `X-Accel-Buffering: no`, not a change to the API.
- **Chain writes.** Settlement still requires the provider key, which lives only on this
  host in `/opt/keys`. Never put it in Vercel environment variables.
