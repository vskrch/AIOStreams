/**
 * Cloudflare Workers Environment Bindings
 * These types define the bindings available in your Worker
 */

export interface Env {
  // D1 Database
  DB: D1Database;
  
  // KV Namespace for caching
  CACHE: KVNamespace;
  
  // Environment variables (set via wrangler secret or dashboard)
  SECRET_KEY: string;
  NODE_ENV?: string;
  
  // Debrid API Keys
  REALDEBRID_API_KEY?: string;
  ALLDEBRID_API_KEY?: string;
  PREMIUMIZE_API_KEY?: string;
  DEBRIDLINK_API_KEY?: string;
  TORBOX_API_KEY?: string;
  OFFCLOUD_API_KEY?: string;
  EASYDEBRID_API_KEY?: string;
  
  // External Services
  TMDB_API_KEY?: string;
  RPDB_API_KEY?: string;
  
  // Built-in Addon Configuration
  ZILEAN_URL?: string;
  TORZNAB_URL?: string;
  TORZNAB_API_KEY?: string;
  PROWLARR_URL?: string;
  PROWLARR_API_KEY?: string;
  
  // Proxy Configuration
  MEDIAFLOW_PROXY_URL?: string;
  STREMTHRU_URL?: string;
  
  // Feature Flags
  ENABLE_SEARCH_API?: string;
  ALTERNATE_DESIGN?: string;
  
  // Optional R2 bucket for assets
  ASSETS?: R2Bucket;
}

/**
 * Variables available in the worker context
 */
export interface Variables {
  // Request ID for logging
  requestId: string;
  
  // Parsed user data from URL params
  userData?: {
    uuid: string;
    encryptedPassword: string;
  };
  
  // IP address of the client
  clientIp: string;
}

/**
 * Combined context type for Hono
 */
export type HonoEnv = {
  Bindings: Env;
  Variables: Variables;
};
