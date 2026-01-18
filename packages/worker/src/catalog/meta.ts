/**
 * Meta Fetcher for Workers
 * 
 * Fetches metadata from external Stremio addons.
 */

export interface MetaLink {
  name: string;
  category: string;
  url: string;
}

export interface MetaVideo {
  id: string;
  title: string;
  released?: string;
  thumbnail?: string;
  overview?: string;
  season?: number;
  episode?: number;
  streams?: any[];
}

export interface Meta {
  id: string;
  type: string;
  name: string;
  poster?: string;
  posterShape?: 'square' | 'poster' | 'landscape';
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  genres?: string[];
  cast?: string[];
  director?: string[];
  writer?: string[];
  runtime?: string;
  language?: string;
  country?: string;
  awards?: string;
  website?: string;
  links?: MetaLink[];
  videos?: MetaVideo[];
  trailers?: Array<{ source: string; type: string }>;
  behaviorHints?: {
    defaultVideoId?: string;
    hasScheduledVideos?: boolean;
  };
}

export interface AddonMetaConfig {
  name: string;
  url: string;
  timeout?: number;
}

export interface FetchMetaOptions {
  timeout?: number;
  signal?: AbortSignal;
}

/**
 * Fetch metadata from an addon
 */
export async function fetchMeta(
  addon: AddonMetaConfig,
  type: string,
  id: string,
  options: FetchMetaOptions = {}
): Promise<{ meta: Meta | null; error?: string }> {
  const timeout = options.timeout || addon.timeout || 15000;
  
  // Clean ID (remove .json suffix if present)
  const cleanId = id.replace('.json', '');
  
  // Build the URL
  const url = `${addon.url.replace(/\/$/, '')}/meta/${type}/${cleanId}.json`;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      signal: options.signal || controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AIOStreams-Workers/1.0',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return {
        meta: null,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const data = await response.json() as { meta?: Meta };
    
    return { meta: data.meta || null };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { meta: null, error: 'Request timed out' };
    }
    return { meta: null, error: error.message || 'Unknown error' };
  }
}

/**
 * Fetch metadata from the first addon that returns a result
 */
export async function fetchMetaFromAddons(
  addons: AddonMetaConfig[],
  type: string,
  id: string,
  options: FetchMetaOptions = {}
): Promise<{ meta: Meta | null; source?: string; error?: string }> {
  // Try addons in parallel and return the first successful result
  const results = await Promise.allSettled(
    addons.map(async (addon) => {
      const result = await fetchMeta(addon, type, id, options);
      if (result.meta) {
        return { meta: result.meta, source: addon.name };
      }
      throw new Error(result.error || 'No meta found');
    })
  );
  
  // Find the first successful result
  for (const result of results) {
    if (result.status === 'fulfilled') {
      return result.value;
    }
  }
  
  // All failed
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => r.reason?.message || 'Unknown error');
  
  return {
    meta: null,
    error: errors.join('; '),
  };
}

/**
 * Merge metadata from multiple sources
 */
export function mergeMeta(primary: Meta, secondary: Meta): Meta {
  return {
    ...secondary,
    ...primary,
    // Merge arrays instead of replacing
    genres: [...new Set([...(primary.genres || []), ...(secondary.genres || [])])],
    cast: [...new Set([...(primary.cast || []), ...(secondary.cast || [])])],
    director: [...new Set([...(primary.director || []), ...(secondary.director || [])])],
    writer: [...new Set([...(primary.writer || []), ...(secondary.writer || [])])],
    links: [...(primary.links || []), ...(secondary.links || [])],
    videos: primary.videos?.length ? primary.videos : secondary.videos,
  };
}

/**
 * Extract IMDB ID from a Stremio ID
 */
export function extractImdbId(id: string): string | null {
  // Format: tt1234567 or tt1234567:1:1
  const match = id.match(/^(tt\d+)/);
  return match ? match[1] : null;
}

/**
 * Parse a Stremio episode ID
 */
export function parseEpisodeId(id: string): {
  imdbId: string;
  season?: number;
  episode?: number;
} | null {
  // Format: tt1234567:1:1 (imdbId:season:episode)
  const match = id.match(/^(tt\d+)(?::(\d+):(\d+))?/);
  if (!match) return null;
  
  return {
    imdbId: match[1],
    season: match[2] ? parseInt(match[2]) : undefined,
    episode: match[3] ? parseInt(match[3]) : undefined,
  };
}
