/**
 * Prowlarr Addon for Workers
 * 
 * Integrates with Prowlarr for multi-indexer searching.
 */

import { ParsedStream } from '../streams/types.js';

export interface ProwlarrConfig {
  url: string;
  apiKey: string;
}

export interface ProwlarrSearchParams {
  query?: string;
  imdbId?: string;
  tmdbId?: number;
  tvdbId?: number;
  type?: 'movie' | 'series';
  season?: number;
  episode?: number;
  categories?: number[];
  indexerIds?: number[];
  limit?: number;
}

interface ProwlarrResult {
  guid: string;
  title: string;
  size: number;
  publishDate: string;
  downloadUrl?: string;
  magnetUrl?: string;
  infoHash?: string;
  seeders?: number;
  leechers?: number;
  indexer: string;
  indexerId: number;
  categories?: Array<{ id: number; name: string }>;
}

/**
 * Search Prowlarr
 */
export async function searchProwlarr(
  config: ProwlarrConfig,
  params: ProwlarrSearchParams
): Promise<ParsedStream[]> {
  const url = new URL('/api/v1/search', config.url);
  url.searchParams.set('type', 'search');
  
  if (params.query) url.searchParams.set('query', params.query);
  if (params.categories?.length) {
    url.searchParams.set('categories', params.categories.join(','));
  }
  if (params.indexerIds?.length) {
    url.searchParams.set('indexerIds', params.indexerIds.join(','));
  }
  if (params.limit) url.searchParams.set('limit', params.limit.toString());
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'X-Api-Key': config.apiKey,
        'User-Agent': 'AIOStreams-Workers/1.0',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Prowlarr API error: ${response.status}`);
    }
    
    const results = await response.json() as ProwlarrResult[];
    
    return results.map(result => parseProwlarrResult(result));
  } catch (error: any) {
    console.error('Prowlarr search error:', error);
    throw error;
  }
}

/**
 * Parse a Prowlarr result into a ParsedStream
 */
function parseProwlarrResult(result: ProwlarrResult): ParsedStream {
  const title = result.title;
  
  // Extract resolution
  const resolutionMatch = title.match(/\b(4K|2160p|1080p|720p|480p|360p)\b/i);
  const resolution = resolutionMatch?.[1]?.toUpperCase().replace('2160P', '4K');
  
  // Extract quality
  const qualityMatch = title.match(/\b(BluRay|Remux|WEB-DL|WEBRip|HDRip|BRRip|DVDRip|HDTV|CAM|TS)\b/i);
  const quality = qualityMatch?.[1];
  
  // Extract codec
  const codecMatch = title.match(/\b(x265|x264|HEVC|H\.?265|H\.?264|AV1)\b/i);
  const codec = codecMatch?.[1];
  
  // Extract audio
  const audioMatch = title.match(/\b(Atmos|TrueHD|DTS-HD(?:\s*MA)?|DTS|DD\+?|AAC)\b/i);
  const audio = audioMatch?.[1];
  
  // Determine URL and info hash
  let url = result.magnetUrl || result.downloadUrl || '';
  let infoHash = result.infoHash?.toLowerCase();
  
  // Extract info hash from magnet if not provided
  if (!infoHash && url.startsWith('magnet:')) {
    const hashMatch = url.match(/btih:([a-fA-F0-9]{40})/i);
    infoHash = hashMatch?.[1]?.toLowerCase();
  }
  
  return {
    addon: 'Prowlarr',
    source: 'torrent',
    infoHash,
    url,
    filename: title,
    size: result.size,
    seeders: result.seeders,
    leechers: result.leechers,
    resolution,
    quality,
    codec,
    audio,
    indexer: result.indexer,
  };
}

/**
 * Get list of indexers from Prowlarr
 */
export async function getProwlarrIndexers(
  config: ProwlarrConfig
): Promise<Array<{ id: number; name: string; enable: boolean }>> {
  const url = new URL('/api/v1/indexer', config.url);
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'X-Api-Key': config.apiKey,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Prowlarr API error: ${response.status}`);
    }
    
    const indexers = await response.json() as Array<{
      id: number;
      name: string;
      enable: boolean;
    }>;
    
    return indexers.filter(i => i.enable);
  } catch (error: any) {
    console.error('Prowlarr indexer list error:', error);
    return [];
  }
}
