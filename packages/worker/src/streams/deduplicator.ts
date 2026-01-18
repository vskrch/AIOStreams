/**
 * Stream Deduplicator for Workers
 * 
 * Removes duplicate streams based on configurable methods.
 */

import { ParsedStream } from './types.js';

export type DeduplicationMethod = 
  | 'infoHash'
  | 'filename'
  | 'smart';

export interface DeduplicationConfig {
  methods: DeduplicationMethod[];
  keepBest?: boolean;
}

/**
 * Generate a smart hash for a stream
 * This creates a hash based on key attributes to identify similar streams
 */
function generateSmartHash(stream: ParsedStream): string {
  const parts = [
    stream.resolution || '',
    stream.quality || '',
    stream.codec || '',
    normalizeFilename(stream.filename || ''),
  ];
  
  return parts.join('|').toLowerCase();
}

/**
 * Normalize a filename for comparison
 */
function normalizeFilename(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\d+/g, 'N'); // Replace numbers with placeholder
}

/**
 * Get the deduplication key for a stream
 */
function getDedupeKey(stream: ParsedStream, method: DeduplicationMethod): string | null {
  switch (method) {
    case 'infoHash':
      return stream.infoHash || null;
      
    case 'filename':
      if (!stream.filename) return null;
      return normalizeFilename(stream.filename);
      
    case 'smart':
      return generateSmartHash(stream);
      
    default:
      return null;
  }
}

/**
 * Compare two streams and return the "better" one
 */
function compareBest(a: ParsedStream, b: ParsedStream): number {
  // Prefer cached
  if (a.cached !== b.cached) {
    return a.cached ? -1 : 1;
  }
  
  // Prefer more seeders
  const seeders = (b.seeders ?? 0) - (a.seeders ?? 0);
  if (seeders !== 0) return seeders;
  
  // Prefer larger size (usually better quality)
  const size = (b.size ?? 0) - (a.size ?? 0);
  if (size !== 0) return size;
  
  return 0;
}

/**
 * Deduplicate streams based on configuration
 */
export function deduplicateStreams(
  streams: ParsedStream[],
  config: DeduplicationConfig
): ParsedStream[] {
  if (!config.methods.length) {
    return streams;
  }
  
  const seen = new Map<string, ParsedStream>();
  const result: ParsedStream[] = [];
  
  for (const stream of streams) {
    let isDuplicate = false;
    
    for (const method of config.methods) {
      const key = getDedupeKey(stream, method);
      
      if (key) {
        const fullKey = `${method}:${key}`;
        
        if (seen.has(fullKey)) {
          isDuplicate = true;
          
          if (config.keepBest) {
            const existing = seen.get(fullKey)!;
            if (compareBest(stream, existing) < 0) {
              // New stream is better, replace
              const existingIndex = result.indexOf(existing);
              if (existingIndex !== -1) {
                result[existingIndex] = stream;
              }
              seen.set(fullKey, stream);
            }
          }
          break;
        } else {
          seen.set(fullKey, stream);
        }
      }
    }
    
    if (!isDuplicate) {
      result.push(stream);
    }
  }
  
  return result;
}

/**
 * Default deduplication configuration
 */
export const DEFAULT_DEDUPE_CONFIG: DeduplicationConfig = {
  methods: ['infoHash', 'smart'],
  keepBest: true,
};
