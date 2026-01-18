/**
 * Zilean Addon for Workers
 * 
 * Searches Zilean DMM hashlist scraper for cached torrents.
 */

import { ParsedStream } from '../streams/types.js';

export interface ZileanConfig {
  url: string;  // Zilean instance URL
}

export interface ZileanSearchParams {
  query: string;
  season?: number;
  episode?: number;
}

interface ZileanResult {
  info_hash: string;
  raw_title: string;
  size: number;
  parsed_title?: string;
  year?: number;
  resolution?: string;
  quality?: string;
  codec?: string;
  audio?: string;
  group?: string;
  season?: number;
  episode?: number;
}

/**
 * Search Zilean for torrents
 */
export async function searchZilean(
  config: ZileanConfig,
  params: ZileanSearchParams
): Promise<ParsedStream[]> {
  const url = new URL('/dmm/search', config.url);
  url.searchParams.set('query', params.query);
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AIOStreams-Workers/1.0',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Zilean API error: ${response.status}`);
    }
    
    let results = await response.json() as ZileanResult[];
    
    // Filter by season/episode if specified
    if (params.season !== undefined) {
      results = results.filter(r => r.season === params.season);
    }
    if (params.episode !== undefined) {
      results = results.filter(r => r.episode === params.episode);
    }
    
    return results.map(result => parseZileanResult(result));
  } catch (error: any) {
    console.error('Zilean search error:', error);
    throw error;
  }
}

/**
 * Parse a Zilean result into a ParsedStream
 */
function parseZileanResult(result: ZileanResult): ParsedStream {
  const title = result.raw_title;
  const infoHash = result.info_hash.toLowerCase();
  
  // Use parsed data if available, otherwise extract from title
  let resolution = result.resolution;
  let quality = result.quality;
  let codec = result.codec;
  let audio = result.audio;
  
  if (!resolution) {
    const match = title.match(/\b(4K|2160p|1080p|720p|480p|360p)\b/i);
    resolution = match?.[1]?.toUpperCase().replace('2160P', '4K');
  }
  
  if (!quality) {
    const match = title.match(/\b(BluRay|Remux|WEB-DL|WEBRip|HDRip|BRRip|DVDRip|HDTV|CAM|TS)\b/i);
    quality = match?.[1];
  }
  
  if (!codec) {
    const match = title.match(/\b(x265|x264|HEVC|H\.?265|H\.?264|AV1)\b/i);
    codec = match?.[1];
  }
  
  if (!audio) {
    const match = title.match(/\b(Atmos|TrueHD|DTS-HD(?:\s*MA)?|DTS|DD\+?|AAC)\b/i);
    audio = match?.[1];
  }
  
  return {
    addon: 'Zilean',
    source: 'torrent',
    infoHash,
    url: `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`,
    filename: title,
    size: result.size,
    resolution,
    quality,
    codec,
    audio,
    releaseGroup: result.group,
    indexer: 'Zilean',
  };
}

/**
 * Build Zilean search query from IMDB ID and type
 */
export function buildZileanQuery(
  imdbId: string,
  type: string,
  season?: number,
  episode?: number
): ZileanSearchParams {
  let query = imdbId;
  
  if (type === 'series' && season !== undefined && episode !== undefined) {
    query = `${imdbId} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
  }
  
  return {
    query,
    season,
    episode,
  };
}
