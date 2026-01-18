# Deploying AIOStreams to Cloudflare Workers

This guide walks you through deploying the AIOStreams Worker to Cloudflare.

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://dash.cloudflare.com/sign-up)
2. **Wrangler CLI**: Install globally with `npm install -g wrangler`
3. **Node.js >= 18**: Required for Wrangler

## Step 1: Login to Cloudflare

```bash
wrangler login
```

This opens your browser to authenticate with Cloudflare.

## Step 2: Create D1 Database

```bash
# Create the database
wrangler d1 create aiostreams

# Note the database_id from the output, you'll need it
```

Update `wrangler.toml` with your database ID:

```toml
[[d1_databases]]
binding = "DB"
database_name = "aiostreams"
database_id = "your-actual-database-id-here"
```

## Step 3: Create KV Namespace

```bash
# Create KV namespace for caching
wrangler kv:namespace create CACHE

# Note the id from the output
```

Update `wrangler.toml` with your KV namespace ID:

```toml
[[kv_namespaces]]
binding = "CACHE"
id = "your-actual-kv-id-here"
```

## Step 4: Set Secret Environment Variables

```bash
# Required: Secret key for encryption
wrangler secret put SECRET_KEY
# Enter a 64-character hex string when prompted

# Optional: API keys for various services
wrangler secret put TMDB_API_KEY
wrangler secret put REALDEBRID_API_KEY
wrangler secret put TORBOX_API_KEY
# ... add other API keys as needed
```

## Step 5: Initialize Database Schema

Run database migrations:

```bash
# Apply schema to D1
wrangler d1 execute aiostreams --remote --command "
CREATE TABLE IF NOT EXISTS users (
  uuid TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  config TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  last_accessed INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);
"
```

## Step 6: Build and Deploy

```bash
# From the project root
pnpm run deploy:worker

# Or manually:
pnpm run build:worker
wrangler deploy
```

## Step 7: Verify Deployment

After deployment, Wrangler will show your worker URL (e.g., `https://aiostreams.your-subdomain.workers.dev`).

Test the health endpoint:

```bash
curl https://aiostreams.your-subdomain.workers.dev/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "runtime": "cloudflare-workers"
}
```

## Local Development

Run the worker locally:

```bash
pnpm run dev:worker
# or
cd packages/worker && wrangler dev
```

This starts a local server at `http://localhost:8787`.

## Custom Domain Setup

1. Go to your Cloudflare Dashboard
2. Navigate to Workers & Pages > Your Worker > Settings > Triggers
3. Add a custom domain (must be on Cloudflare DNS)

## Monitoring & Logs

View real-time logs:

```bash
wrangler tail
```

View logs in Cloudflare Dashboard:
- Workers & Pages > Your Worker > Logs

## Troubleshooting

### "Cannot find module" errors
Ensure all dependencies are installed:
```bash
pnpm install
```

### Database connection errors
Verify your database ID in `wrangler.toml` matches the one from `wrangler d1 list`.

### Secret not found
Re-set secrets using `wrangler secret put SECRET_NAME`.

### Build failures
Check that the core package builds first:
```bash
pnpm -F core run build
pnpm -F @aiostreams/worker run build
```

## Current Limitations

> [!WARNING]
> **The Worker version is currently a foundation.** Full feature parity with the Node.js version requires additional work:
>
> - Stream fetching from external addons (partially implemented)
> - Full configuration UI (placeholder only)
> - All built-in addon integrations (stubs only)
> - OAuth flows for Google Drive
> - Rate limiting (needs to use Durable Objects for distributed limiting)

## Next Steps for Full Implementation

1. **Migrate route handlers**: Port the Express route logic to Hono
2. **Implement built-in addons**: Add Knaben, TorBox, etc. using fetch()
3. **Frontend deployment**: Deploy the React frontend to Cloudflare Pages
4. **Connect frontend to API**: Update API endpoints in frontend code

## Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Hono Framework](https://hono.dev/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [KV Storage](https://developers.cloudflare.com/kv/)
