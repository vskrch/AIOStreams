/**
 * AnimeTosho Addon for Workers
 * 
 * Searches AnimeTosho for anime torrents.
 */

import { ParsedStream } from '../streams/types.js';

const ANIMETOSHO_API = 'https://feed.animetosho.org/json';

export interface AnimeToshoSearchParams {
  query?: string;
  eid?: number;  // AniDB episode ID
  aid?: number;  // AniDB anime ID
  show?: string; // Show name
  limit?: number;
}

interface AnimeToshoResult {
  id: number;
  title: string;
  link: string;
  magnet_uri?: string;
  info_hash?: string;
  total_size: number;
  seeders?: number;
  leechers?: number;
  timestamp: number;
}

/**
 * Search AnimeTosho for anime torrents
 */
export async function searchAnimeTosho(
  params: AnimeToshoSearchParams
): Promise<ParsedStream[]> {
  const url = new URL(ANIMETOSHO_API);
  
  if (params.query) url.searchParams.set('q', params.query);
  if (params.eid) url.searchParams.set('eid', params.eid.toString());
  if (params.aid) url.searchParams.set('aid', params.aid.toString());
  if (params.show) url.searchParams.set('show', params.show);
  if (params.limit) url.searchParams.set('limit', params.limit.toString());
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AIOStreams-Workers/1.0',
      },
    });
    
    if (!response.ok) {
      throw new Error(`AnimeTosho API error: ${response.status}`);
    }
    
    const results = await response.json() as AnimeToshoResult[];
    
    return results
      .filter(r => r.magnet_uri || r.info_hash)
      .map(result => parseAnimeToshoResult(result));
  } catch (error: any) {
    console.error('AnimeTosho search error:', error);
    throw error;
  }
}

/**
 * Parse an AnimeTosho result into a ParsedStream
 */
function parseAnimeToshoResult(result: AnimeToshoResult): ParsedStream {
  const title = result.title;
  
  // Extract resolution
  const resolutionMatch = title.match(/\b(4K|2160p|1080p|720p|480p|360p)\b/i);
  const resolution = resolutionMatch?.[1]?.toUpperCase().replace('2160P', '4K');
  
  // Extract codec
  const codecMatch = title.match(/\b(x265|x264|HEVC|H\.?265|H\.?264|AV1)\b/i);
  const codec = codecMatch?.[1];
  
  // Extract audio
  const audioMatch = title.match(/\b(FLAC|AAC|Opus|DTS|AC3)\b/i);
  const audio = audioMatch?.[1];
  
  // Extract sub group (usually in brackets at the end)
  const groupMatch = title.match(/\[([^\]]+)\](?:\s*$|\s*\[)/);
  const releaseGroup = groupMatch?.[1];
  
  // Build magnet URL
  const infoHash = result.info_hash?.toLowerCase();
  const magnetUrl = result.magnet_uri || 
    `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`;
  
  return {
    addon: 'AnimeTosho',
    source: 'torrent',
    infoHash,
    url: magnetUrl,
    filename: title,
    size: result.total_size,
    seeders: result.seeders,
    leechers: result.leechers,
    resolution,
    codec,
    audio,
    releaseGroup,
    indexer: 'AnimeTosho',
  };
}

/**
 * Build AnimeTosho query from anime title and episode
 */
export function buildAnimeToshoQuery(
  title: string,
  episode?: number,
  season?: number
): string {
  let query = title;
  
  if (season !== undefined && episode !== undefined) {
    // Try different episode formats for anime
    query = `${title} ${String(episode).padStart(2, '0')}`;
  } else if (episode !== undefined) {
    query = `${title} ${String(episode).padStart(2, '0')}`;
  }
  
  return query;
}
