/**
 * Knaben Addon for Workers
 * 
 * Searches the Knaben indexer proxy for torrents.
 * Knaben aggregates results from multiple torrent sites.
 */

import { ParsedStream } from '../streams/types.js';

const KNABEN_API = 'https://knaben.eu/api';

export interface KnabenSearchParams {
  query: string;
  category?: 'movies' | 'tv' | 'anime' | 'all';
  limit?: number;
}

interface KnabenResult {
  t: string;      // Title
  ih: string;     // Info hash
  s: number;      // Size in bytes
  se: number;     // Seeders
  le: number;     // Leechers
  dt: string;     // Date
  tr: string[];   // Trackers
  c: string;      // Category
}

/**
 * Search Knaben for torrents
 */
export async function searchKnaben(
  params: KnabenSearchParams
): Promise<ParsedStream[]> {
  const url = new URL(`${KNABEN_API}/search`);
  url.searchParams.set('q', params.query);
  
  if (params.category && params.category !== 'all') {
    url.searchParams.set('c', params.category);
  }
  
  if (params.limit) {
    url.searchParams.set('limit', params.limit.toString());
  }
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AIOStreams-Workers/1.0',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Knaben API error: ${response.status}`);
    }
    
    const results = await response.json() as KnabenResult[];
    
    return results.map(result => parseKnabenResult(result));
  } catch (error: any) {
    console.error('Knaben search error:', error);
    throw error;
  }
}

/**
 * Parse a Knaben result into a ParsedStream
 */
function parseKnabenResult(result: KnabenResult): ParsedStream {
  const title = result.t;
  
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
  
  // Extract HDR
  const hdr: string[] = [];
  if (/\bDV\b|Dolby\s*Vision/i.test(title)) hdr.push('DV');
  if (/\bHDR10\+/i.test(title)) hdr.push('HDR10+');
  else if (/\bHDR10\b/i.test(title)) hdr.push('HDR10');
  else if (/\bHDR\b/i.test(title)) hdr.push('HDR');
  
  // Create magnet URL
  const magnetUrl = `magnet:?xt=urn:btih:${result.ih}&dn=${encodeURIComponent(title)}`;
  
  return {
    addon: 'Knaben',
    source: 'torrent',
    infoHash: result.ih.toLowerCase(),
    url: magnetUrl,
    filename: title,
    size: result.s,
    seeders: result.se,
    leechers: result.le,
    resolution,
    quality,
    codec,
    audio,
    hdr: hdr.length ? hdr : undefined,
    indexer: 'Knaben',
  };
}

/**
 * Build search query from IMDB ID and type
 */
export function buildKnabenQuery(
  imdbId: string,
  type: string,
  season?: number,
  episode?: number
): string {
  let query = imdbId;
  
  if (type === 'series' && season !== undefined) {
    const seasonStr = season.toString().padStart(2, '0');
    if (episode !== undefined) {
      const episodeStr = episode.toString().padStart(2, '0');
      query = `${imdbId} S${seasonStr}E${episodeStr}`;
    } else {
      query = `${imdbId} S${seasonStr}`;
    }
  }
  
  return query;
}
