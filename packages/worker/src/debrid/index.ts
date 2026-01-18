/**
 * Debrid Services Index
 * 
 * Real-Debrid integration for Cloudflare Workers.
 */

export { RealDebrid, RealDebridConfig, RDCacheStatus, RDAccountInfo } from './realdebrid.js';

// Type for debrid service (only Real-Debrid supported currently)
export type DebridService = 'realdebrid';

export interface DebridConfig {
  service: DebridService;
  apiKey: string;
}
