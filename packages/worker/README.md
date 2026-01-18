# AIOStreams - Cloudflare Workers Edition

> A complete adaptation of AIOStreams for Cloudflare Workers, providing edge-deployed Stremio addon functionality with full feature parity.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Implementation Details](#implementation-details)
- [API Reference](#api-reference)
- [Deployment Guide](#deployment-guide)
- [Configuration](#configuration)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

---

## Overview

### What is AIOStreams?

AIOStreams is a Stremio addon aggregator that consolidates multiple streaming addons and debrid services into a single, configurable endpoint. This Workers edition provides:

- **Edge Deployment**: Runs on Cloudflare's global edge network (300+ locations)
- **Serverless Architecture**: No server management, automatic scaling
- **Cost Effective**: Cloudflare Workers free tier includes 100,000 requests/day
- **Low Latency**: Requests served from the nearest edge location

### Live Deployments

| Component | URL | Purpose |
|-----------|-----|---------|
| Worker API | `https://aiostreams.aiostreamsvenky.workers.dev` | Backend API |
| Frontend UI | `https://aiostreams-frontend.pages.dev` | Configuration UI |

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Cloudflare Edge Network                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────────┐       ┌─────────────────────┐                 │
│   │   Cloudflare Pages  │       │  Cloudflare Worker  │                 │
│   │   (Frontend UI)     │──────▶│  (API Backend)      │                 │
│   │   - React/Next.js   │       │  - Hono Framework   │                 │
│   │   - Static Export   │       │  - TypeScript       │                 │
│   └─────────────────────┘       └──────────┬──────────┘                 │
│                                            │                             │
│                          ┌─────────────────┼─────────────────┐          │
│                          │                 │                 │          │
│                          ▼                 ▼                 ▼          │
│                    ┌──────────┐     ┌──────────┐     ┌──────────┐       │
│                    │    D1    │     │    KV    │     │ Secrets  │       │
│                    │ Database │     │   Cache  │     │  Store   │       │
│                    └──────────┘     └──────────┘     └──────────┘       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
          ▼                          ▼                          ▼
    ┌───────────┐            ┌───────────────┐          ┌────────────┐
    │  External │            │    Debrid     │          │   Torrent  │
    │  Stremio  │            │   Services    │          │  Indexers  │
    │  Addons   │            │  (Real-Debrid)│          │  (Built-in)│
    └───────────┘            └───────────────┘          └────────────┘
```

### Request Flow

```
1. Stremio App → Worker
   └── GET /:uuid/:password/stream/movie/tt1234567

2. Worker → Authentication
   ├── Decrypt password (Base64)
   └── Validate user (D1 database)

3. Worker → Stream Fetching
   ├── Fetch from user's configured addons (parallel)
   ├── Search built-in indexers (Knaben, TG, etc.)
   └── Aggregate all results

4. Worker → Stream Processing
   ├── Filter (resolution, quality, size, etc.)
   ├── Check debrid cache (Real-Debrid API)
   ├── Sort (by preference)
   ├── Deduplicate (by infoHash)
   └── Format (with templates)

5. Worker → Response
   └── Return Stremio-compatible stream list
```

---

## Features

### Core Features

| Feature | Status | Description |
|---------|--------|-------------|
| Stream Fetching | ✅ | Fetch from multiple external addons in parallel |
| Stream Filtering | ✅ | Resolution, quality, size, seeders, keywords |
| Advanced Filtering | ✅ | Title/Year/Episode matching |
| Stream Sorting | ✅ | Multi-criteria with preferred values |
| Deduplication | ✅ | By infoHash and smart hash |
| Template Formatting | ✅ | Conditional templates with modifiers |
| Catalog Fetching | ✅ | Aggregate catalogs from addons |
| Meta Fetching | ✅ | Fetch metadata with fallback |
| User Management | ✅ | Full CRUD via D1 database |

### Debrid Services

| Service | Status | Features |
|---------|--------|----------|
| Real-Debrid | ✅ | Cache check, stream URLs, account info |
| AllDebrid | ⚪ | Not implemented (per user request) |
| Other services | ⚪ | Not implemented |

### Built-in Addons

| Addon | Status | Description |
|-------|--------|-------------|
| Knaben | ✅ | Multi-source torrent aggregator |
| Torrent Galaxy | ✅ | Popular torrent tracker |
| AnimeTosho | ✅ | Anime torrent search |
| Zilean | ✅ | DMM hashlist scraper |
| Torznab | ✅ | Jackett-compatible indexers |
| Prowlarr | ✅ | Multi-indexer search |
| TorBox | ✅ | TorBox search |

### MediaFlow Proxy

The worker comes pre-configured with a default MediaFlow instance if environment secrets are set.

1. **Configure in Worker**:
   ```bash
   wrangler secret put MEDIAFLOW_PROXY_URL
   wrangler secret put MEDIAFLOW_PROXY_PASSWORD
   ```

2. **Use in Stremio**:
   - Go to Proxy settings in the frontend
   - Select **MediaFlow**
   - Leave URL/Password blank to use the default server
   - Or enter custom values to override

---

## Project Structure

```
packages/worker/
├── src/
│   ├── index.ts                 # Worker entry point (fetch handler)
│   ├── app.ts                   # Hono application setup
│   ├── bindings.ts              # Cloudflare type definitions
│   │
│   ├── routes/
│   │   ├── api/index.ts         # REST API routes (/api/v1/*)
│   │   ├── stremio/index.ts     # Stremio addon routes
│   │   └── builtins/index.ts    # Built-in addon routes
│   │
│   ├── streams/
│   │   ├── types.ts             # Stream type definitions
│   │   ├── filter.ts            # Basic filtering
│   │   ├── advanced-filter.ts   # Title/Year/Episode matching
│   │   ├── sorter.ts            # Multi-criteria sorting
│   │   ├── deduplicator.ts      # Hash-based deduplication
│   │   ├── formatter.ts         # Basic formatting
│   │   ├── enhanced-formatter.ts # Template engine
│   │   ├── fetcher.ts           # Addon fetching
│   │   └── index.ts             # Module exports
│   │
│   ├── catalog/
│   │   ├── fetcher.ts           # Catalog aggregation
│   │   ├── meta.ts              # Metadata fetching
│   │   └── index.ts             # Module exports
│   │
│   ├── debrid/
│   │   ├── realdebrid.ts        # Real-Debrid API
│   │   └── index.ts             # Module exports
│   │
│   ├── builtins/
│   │   ├── knaben.ts            # Knaben search
│   │   ├── torrent-galaxy.ts    # Torrent Galaxy
│   │   ├── animetosho.ts        # AnimeTosho
│   │   ├── zilean.ts            # Zilean
│   │   ├── torznab.ts           # Torznab/Jackett
│   │   ├── prowlarr.ts          # Prowlarr
│   │   ├── torbox.ts            # TorBox
│   │   └── index.ts             # Module exports
│   │
│   ├── proxy/
│   │   ├── mediaflow.ts         # MediaFlow proxy
│   │   ├── stremthru.ts         # StremThru proxy
│   │   └── index.ts             # Module exports
│   │
│   └── utils/
│       ├── crypto.ts            # Web Crypto utilities
│       ├── cache.ts             # KV cache adapter
│       ├── database.ts          # D1 database adapter
│       └── user-repository.ts   # User CRUD operations
│
├── schema.sql                   # D1 database schema
├── package.json                 # Package configuration
├── tsconfig.json                # TypeScript configuration
└── DEPLOYMENT.md                # Deployment guide
```

---

## Technology Stack

### Runtime

| Technology | Purpose |
|------------|---------|
| Cloudflare Workers | Edge runtime (V8 isolates) |
| Hono | Lightweight web framework |
| TypeScript | Type-safe development |

### Storage

| Service | Purpose |
|---------|---------|
| Cloudflare D1 | SQLite database (users, config) |
| Cloudflare KV | Key-value cache |
| Cloudflare Secrets | API keys and credentials |

### Frontend

| Technology | Purpose |
|------------|---------|
| Next.js 15 | React framework |
| Cloudflare Pages | Static hosting |
| Tailwind CSS | Styling |

---

## Implementation Details

### Stream Filtering

The filtering system supports multiple filter types:

```typescript
interface FilterConfig {
  // Resolution filter
  resolutions?: {
    include?: string[];     // ['4K', '1080p']
    exclude?: string[];     // ['480p']
    required?: string[];    // Must have one of these
  };
  
  // Quality filter
  qualities?: {
    include?: string[];     // ['BluRay', 'Remux']
    exclude?: string[];     // ['CAM', 'TS']
  };
  
  // Size filter
  minSize?: number;         // Minimum bytes
  maxSize?: number;         // Maximum bytes
  
  // Seeder filter
  minSeeders?: number;      // Minimum seeders
  
  // Cache filter
  cachedOnly?: boolean;     // Only cached streams
  
  // Keyword filter
  excludeKeywords?: string[]; // Exclude these words
  includeKeywords?: string[]; // Must include one
}
```

### Advanced Filtering (Title/Year/Episode)

```typescript
interface AdvancedFilterConfig {
  titleMatching?: {
    enabled: boolean;
    strictMode?: boolean;     // Exact vs fuzzy match
    expectedTitle?: string;
  };
  
  yearMatching?: {
    enabled: boolean;
    expectedYear?: number;
    tolerance?: number;       // ±N years
  };
  
  episodeMatching?: {
    enabled: boolean;
    season?: number;
    episode?: number;
    excludeSeasonPacks?: boolean;
  };
}
```

### Template Formatter

Templates support variables, conditionals, and modifiers:

```
# Variables
{resolution}              → "1080p"
{size}                    → 2147483648
{cached}                  → true

# Modifiers
{size::bytes}             → "2.00 GB"
{languages::join( )}      → "🇺🇸 🇪🇸"
{source::upper}           → "TORRENT"
{filename::truncate(50)}  → "Movie.2024.1080p..."

# Conditionals
{if cached}⚡{endif}      → "⚡" or ""
{if hdr}{hdr::first}{endif} → "HDR10"
```

### Real-Debrid Integration

```typescript
class RealDebrid {
  // Validate API key
  async validateKey(): Promise<boolean>
  
  // Check cache (batched, max 100)
  async checkCache(hashes: string[]): Promise<Map<string, CacheResult>>
  
  // Get account info
  async getAccountInfo(): Promise<AccountInfo>
  
  // Add magnet and get stream URL
  async getStreamUrl(hash: string, fileId?: number): Promise<string>
}
```

---

## API Reference

### Stremio Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/stremio/manifest.json` | GET | Public manifest |
| `/stremio/configure` | GET | Configuration page |
| `/stremio/:uuid/:password/manifest.json` | GET | User manifest |
| `/stremio/:uuid/:password/stream/:type/:id` | GET | Get streams |
| `/stremio/:uuid/:password/catalog/:type/:id/:extra?` | GET | Get catalog |
| `/stremio/:uuid/:password/meta/:type/:id` | GET | Get metadata |

### API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/health` | GET | Health check |
| `/api/v1/status` | GET | Server status |
| `/api/v1/user` | GET | Get user details |
| `/api/v1/user` | POST | Create user |
| `/api/v1/user` | PUT | Update user |
| `/api/v1/user` | DELETE | Delete user |
| `/api/v1/user/exists` | GET | Check user exists |

### Built-in Addon Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/builtins/knaben/:type/:id` | GET | Knaben search |
| `/builtins/torrentgalaxy/:type/:id` | GET | Torrent Galaxy |
| `/builtins/animetosho/:type/:id` | GET | AnimeTosho |
| `/builtins/zilean/:type/:id` | GET | Zilean search |
| `/builtins/torznab/:type/:id` | GET | Torznab search |
| `/builtins/prowlarr/:type/:id` | GET | Prowlarr search |
| `/builtins/realdebrid/validate` | GET | Validate RD key |
| `/builtins/realdebrid/cache` | POST | Check cache |
| `/builtins/realdebrid/stream` | POST | Get stream URL |

---

## Deployment Guide

### Prerequisites

- Node.js 18+ 
- pnpm (package manager)
- Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

### Step 1: Clone and Install

```bash
git clone https://github.com/your-repo/AIOStreams.git
cd AIOStreams
pnpm install
```

### Step 2: Authenticate with Cloudflare

```bash
wrangler login
# Browser opens for OAuth authentication
```

### Step 3: Create D1 Database

```bash
wrangler d1 create aiostreams

# Output:
# ✅ Successfully created DB 'aiostreams'
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy the `database_id` and update `wrangler.toml`:**

```toml
[[d1_databases]]
binding = "DB"
database_name = "aiostreams"
database_id = "YOUR-DATABASE-ID"  # ← Replace this
```

### Step 4: Create KV Namespace

```bash
wrangler kv namespace create CACHE

# Output:
# ✨ Success!
# id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**Update `wrangler.toml`:**

```toml
[[kv_namespaces]]
binding = "CACHE"
id = "YOUR-KV-ID"  # ← Replace this
```

### Step 5: Initialize Database Schema

```bash
wrangler d1 execute aiostreams --file=packages/worker/schema.sql --remote
```

### Step 6: Set Secrets

```bash
# Required: Real-Debrid API key
wrangler secret put REALDEBRID_API_KEY
# Enter your key when prompted

# Optional: Zilean
wrangler secret put ZILEAN_URL
# Example: https://zileanfortheweebs.midnightignite.me

# Optional: Torznab (Jackett)
wrangler secret put TORZNAB_URL
wrangler secret put TORZNAB_API_KEY

# Optional: Prowlarr
wrangler secret put PROWLARR_URL
wrangler secret put PROWLARR_API_KEY
```

### Step 7: Deploy Worker

```bash
# Build and deploy
pnpm run deploy:worker

# Or using wrangler directly
wrangler deploy

# Output:
# Uploaded aiostreams
# https://aiostreams.YOUR-SUBDOMAIN.workers.dev
```

### Step 8: Deploy Frontend (Optional)

```bash
# Build frontend with API URL
cd packages/frontend
NEXT_PUBLIC_BACKEND_BASE_URL="https://YOUR-WORKER-URL/api/v1" pnpm run build

# Deploy to Cloudflare Pages
cd ../..
wrangler pages deploy packages/frontend/out --project-name aiostreams-frontend

# Output:
# ✨ Deployment complete!
# https://aiostreams-frontend.pages.dev
```

### Step 9: Verify Deployment

```bash
# Test manifest
curl https://YOUR-WORKER-URL/stremio/manifest.json

# Test health
curl https://YOUR-WORKER-URL/health

# Test status
curl https://YOUR-WORKER-URL/api/v1/status
```

---

## Configuration

### wrangler.toml Reference

```toml
name = "aiostreams"
main = "packages/worker/dist/index.js"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

# D1 Database
[[d1_databases]]
binding = "DB"
database_name = "aiostreams"
database_id = "YOUR-DATABASE-ID"

# KV Namespace
[[kv_namespaces]]
binding = "CACHE"
id = "YOUR-KV-ID"

# Build command
[build]
command = "pnpm -w run build:worker"
cwd = "."

# Dev server
[dev]
port = 8787
local_protocol = "http"
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REALDEBRID_API_KEY` | Yes* | Real-Debrid API key |
| `ZILEAN_URL` | No | Zilean instance URL |
| `TORZNAB_URL` | No | Jackett/Torznab URL |
| `TORZNAB_API_KEY` | No | Torznab API key |
| `PROWLARR_URL` | No | Prowlarr instance URL |
| `PROWLARR_API_KEY` | No | Prowlarr API key |
| `TMDB_API_KEY` | No | TMDB API key |
| `MEDIAFLOW_PROXY_URL` | No | MediaFlow proxy URL |
| `STREMTHRU_URL` | No | StremThru proxy URL |

*Required for debrid functionality

---

## Development

### Local Development

```bash
# Start development server
cd packages/worker
pnpm run dev

# Or from root
pnpm run dev:worker
```

This starts a local Wrangler dev server at `http://localhost:8787`.

### Testing

```bash
# Test manifest
curl http://localhost:8787/stremio/manifest.json

# Test stream search
curl http://localhost:8787/builtins/knaben/movie/tt1234567

# Test with a specific movie (e.g., Inception)
curl http://localhost:8787/builtins/knaben/movie/tt1375666
```

### Building

```bash
# Build worker only
pnpm run build:worker

# Build everything
pnpm run build
```

### Adding a New Built-in Addon

1. Create `packages/worker/src/builtins/my-addon.ts`:

```typescript
import { ParsedStream } from '../streams/types.js';

export async function searchMyAddon(params: {
  query: string;
}): Promise<ParsedStream[]> {
  const response = await fetch(`https://api.example.com/search?q=${params.query}`);
  const results = await response.json();
  
  return results.map(r => ({
    addon: 'MyAddon',
    source: 'torrent',
    infoHash: r.hash,
    filename: r.title,
    size: r.size,
    seeders: r.seeders,
    // ... other fields
  }));
}
```

2. Export from `packages/worker/src/builtins/index.ts`:

```typescript
export * from './my-addon.js';
```

3. Add route in `packages/worker/src/routes/builtins/index.ts`:

```typescript
builtins.get('/myaddon/:type/:id', async (c) => {
  // Implementation
});
```

---

## Troubleshooting

### Common Issues

**"DNS not resolving"**
- New workers.dev subdomains can take 1-5 minutes to propagate
- Try: `curl -v https://your-worker.workers.dev/health`

**"D1 database not found"**
- Ensure `database_id` in wrangler.toml matches the created database
- Run: `wrangler d1 list` to see available databases

**"Secret not found"**
- Secrets must be set with: `wrangler secret put SECRET_NAME`
- List secrets: `wrangler secret list`

**"Build failing"**
- Run: `pnpm run build:worker` to see TypeScript errors
- Check Node.js version (18+ required)

**"CORS errors in frontend"**
- The Worker includes CORS headers automatically
- Check browser DevTools for actual error

### Logs

```bash
# View real-time logs
wrangler tail

# View logs with filtering
wrangler tail --search "error"
```

### Debugging

```bash
# Local development with --local flag
wrangler dev --local

# Test specific routes
curl -X POST http://localhost:8787/api/v1/user \
  -H "Content-Type: application/json" \
  -d '{"config": {}, "password": "test"}'
```

---

## Credits

- Original AIOStreams project
- Cloudflare Workers platform
- Hono web framework
- All the torrent indexer services

## License

MIT License - See LICENSE file
