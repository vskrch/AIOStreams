/**
 * AIOStreams Cloudflare Worker Entry Point
 * 
 * This is the main entry point for the Cloudflare Workers deployment.
 * It exports the Hono app as the default fetch handler.
 */

import app from './app.js';
import type { Env } from './bindings.js';

// Export the Hono app's fetch handler
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Initialize any required services on first request
    // Note: Workers are stateless, so initialization happens per-request
    // Consider using Durable Objects for persistent state if needed
    
    return app.fetch(request, env, ctx);
  },
  
  // Optional: Scheduled event handler for cron jobs
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Handle scheduled events (e.g., cache cleanup, database maintenance)
    console.log('Scheduled event triggered:', event.cron);
    
    // Example: Cleanup old cache entries
    // await cleanupCache(env);
  },
};

/**
 * Initialize the database schema if needed
 * This should be run during deployment, not on every request
 */
export async function initializeDatabase(db: D1Database): Promise<void> {
  const schemas = [
    `CREATE TABLE IF NOT EXISTS users (
      uuid TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      config TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      last_accessed INTEGER DEFAULT (strftime('%s', 'now'))
    )`,
    `CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at)`,
  ];
  
  for (const schema of schemas) {
    await db.prepare(schema).run();
  }
}
