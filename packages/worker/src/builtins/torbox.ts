/**
 * TorBox Search Addon for Workers
 * 
 * Searches TorBox for cached torrents.
 */

import { ParsedStream } from '../streams/types.js';

const TORBOX_API = 'https://api.torbox.app/v1/api';

export interface TorBoxSearchParams {
  apiKey: string;
  query: string;
  type?: 'movie' | 'series';
}

interface TorBoxSearchResult {
  id: number;
  hash: string;
  name: string;
  size: number;
  added: string;
  files: Array<{
    id: number;
    name: string;
    size: number;
  }>;
}

interface TorBoxCacheResult {
  hash: string;
  cached: boolean;
}

/**
 * Check if torrents are cached on TorBox
 */
export async function checkTorBoxCache(
  apiKey: string,
  hashes: string[]
): Promise<Map<string, boolean>> {
  const url = `${TORBOX_API}/torrents/checkcached`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`TorBox cache check error: ${response.status}`);
    }
    
    const data = await response.json() as { data: TorBoxCacheResult[] };
    const result = new Map<string, boolean>();
    
    for (const item of data.data || []) {
      result.set(item.hash.toLowerCase(), item.cached);
    }
    
    return result;
  } catch (error: any) {
    console.error('TorBox cache check error:', error);
    return new Map();
  }
}

/**
 * Search TorBox for torrents
 */
export async function searchTorBox(
  params: TorBoxSearchParams
): Promise<ParsedStream[]> {
  const url = new URL(`${TORBOX_API}/torrents/search`);
  url.searchParams.set('query', params.query);
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${params.apiKey}`,
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`TorBox search error: ${response.status}`);
    }
    
    const data = await response.json() as { 
      success: boolean;
      data: TorBoxSearchResult[];
    };
    
    if (!data.success || !data.data) {
      return [];
    }
    
    // Check cache status for all results
    const hashes = data.data.map(r => r.hash);
    const cacheStatus = await checkTorBoxCache(params.apiKey, hashes);
    
    return data.data.map(result => parseTorBoxResult(result, cacheStatus));
  } catch (error: any) {
    console.error('TorBox search error:', error);
    throw error;
  }
}

/**
 * Parse a TorBox result into a ParsedStream
 */
function parseTorBoxResult(
  result: TorBoxSearchResult,
  cacheStatus: Map<string, boolean>
): ParsedStream {
  const title = result.name;
  
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
  
  // Check if cached
  const cached = cacheStatus.get(result.hash.toLowerCase()) || false;
  
  return {
    addon: 'TorBox Search',
    source: 'torrent',
    infoHash: result.hash.toLowerCase(),
    url: `magnet:?xt=urn:btih:${result.hash}&dn=${encodeURIComponent(title)}`,
    filename: title,
    size: result.size,
    resolution,
    quality,
    codec,
    audio,
    cached,
    debridService: 'torbox',
    indexer: 'TorBox',
  };
}

/**
 * Validate TorBox API key
 */
export async function validateTorBoxKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${TORBOX_API}/user/me`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get TorBox account info
 */
export async function getTorBoxAccountInfo(apiKey: string): Promise<{
  email: string;
  plan: string;
  premium: boolean;
} | null> {
  try {
    const response = await fetch(`${TORBOX_API}/user/me`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json() as {
      success: boolean;
      data: {
        email: string;
        plan: string;
        is_subscribed: boolean;
      };
    };
    
    if (!data.success) return null;
    
    return {
      email: data.data.email,
      plan: data.data.plan,
      premium: data.data.is_subscribed,
    };
  } catch {
    return null;
  }
}
