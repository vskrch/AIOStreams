/**
 * Stream Types for Workers
 * 
 * Type definitions for parsed streams and related structures.
 */

export interface ParsedStream {
  // Identification
  id?: string;
  infoHash?: string;
  fileIdx?: number;
  
  // Source information
  addon: string;
  addonUrl?: string;
  source: 'torrent' | 'usenet' | 'direct' | 'debrid';
  
  // Video properties
  resolution?: string;
  quality?: string;
  codec?: string;
  hdr?: string[];
  
  // Audio properties
  audio?: string;
  audioChannels?: string;
  languages?: string[];
  
  // File properties
  filename?: string;
  size?: number;
  
  // Torrent properties
  seeders?: number;
  leechers?: number;
  
  // Debrid properties
  cached?: boolean;
  debridService?: string;
  
  // Stream URL
  url: string;
  
  // Grouping
  bingeGroup?: string;
  
  // Metadata for filtering
  releaseGroup?: string;
  indexer?: string;
  
  // Original raw data
  raw?: unknown;
}

export interface StreamError {
  addon: string;
  message: string;
}

export interface StreamResult {
  streams: ParsedStream[];
  errors: StreamError[];
}

// Resolution rankings (lower = better)
export const RESOLUTION_RANK: Record<string, number> = {
  '4K': 1,
  '2160p': 1,
  '1080p': 2,
  '720p': 3,
  '480p': 4,
  '360p': 5,
  'Unknown': 99,
};

// Quality rankings (lower = better)
export const QUALITY_RANK: Record<string, number> = {
  'BluRay': 1,
  'Remux': 2,
  'WEB-DL': 3,
  'WEBRip': 4,
  'HDRip': 5,
  'BRRip': 6,
  'DVDRip': 7,
  'HDTV': 8,
  'SDTV': 9,
  'CAM': 10,
  'TS': 11,
  'Unknown': 99,
};

// Audio format rankings (lower = better)
export const AUDIO_RANK: Record<string, number> = {
  'Atmos': 1,
  'TrueHD': 2,
  'DTS-HD MA': 3,
  'DTS-HD': 4,
  'DTS': 5,
  'DD+': 6,
  'DD': 7,
  'AAC': 8,
  'MP3': 9,
  'Unknown': 99,
};

// HDR rankings (lower = better)
export const HDR_RANK: Record<string, number> = {
  'DV': 1,
  'HDR10+': 2,
  'HDR10': 3,
  'HDR': 4,
  'HLG': 5,
  'SDR': 99,
};

/**
 * Get the rank of a value from a ranking map
 */
export function getRank(value: string | undefined, rankings: Record<string, number>): number {
  if (!value) return 99;
  return rankings[value] ?? 99;
}

/**
 * Compare two streams by a ranking map
 */
export function compareByRank(
  a: string | undefined,
  b: string | undefined,
  rankings: Record<string, number>
): number {
  return getRank(a, rankings) - getRank(b, rankings);
}

/**
 * Standard Stremio stream format
 */
export interface StremioStream {
  name: string;
  title: string;
  url: string;
  infoHash?: string;
  fileIdx?: number;
  behaviorHints?: {
    notWebReady?: boolean;
    bingeGroup?: string;
    proxyHeaders?: {
      request?: Record<string, string>;
      response?: Record<string, string>;
    };
  };
}

/**
 * Stremio stream response
 */
export interface StremioStreamResponse {
  streams: StremioStream[];
}
