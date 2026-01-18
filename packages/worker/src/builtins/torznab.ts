/**
 * Torznab Addon for Workers
 * 
 * Generic Torznab API support for indexers like Jackett.
 */

import { ParsedStream } from '../streams/types.js';

export interface TorznabConfig {
  url: string;
  apiKey: string;
  name?: string;
}

export interface TorznabSearchParams {
  query?: string;
  imdbId?: string;
  tvdbId?: number;
  season?: number;
  episode?: number;
  categories?: number[];
  limit?: number;
}

interface TorznabResult {
  title: string;
  guid: string;
  link: string;
  size: number;
  pubDate: string;
  category?: string;
  seeders?: number;
  peers?: number;
  infoHash?: string;
  magnetUrl?: string;
  downloadUrl?: string;
}

/**
 * Parse Torznab XML response
 */
function parseTorznabXml(xml: string): TorznabResult[] {
  const results: TorznabResult[] = [];
  
  // Simple XML parsing without external dependencies
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  
  for (const match of itemMatches) {
    const item = match[1];
    
    const title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || '';
    const guid = item.match(/<guid.*?>(.*?)<\/guid>/)?.[1] || '';
    const link = item.match(/<link.*?>(.*?)<\/link>/)?.[1] || '';
    const sizeMatch = item.match(/<size>(\d+)<\/size>/) || 
                      item.match(/name="size" value="(\d+)"/);
    const size = sizeMatch ? parseInt(sizeMatch[1]) : 0;
    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
    
    // Extract torznab attributes
    const seedersMatch = item.match(/name="seeders" value="(\d+)"/);
    const peersMatch = item.match(/name="peers" value="(\d+)"/);
    const infoHashMatch = item.match(/name="infohash" value="([a-fA-F0-9]{40})"/);
    const magnetMatch = item.match(/name="magneturl" value="([^"]+)"/);
    
    results.push({
      title,
      guid,
      link,
      size,
      pubDate,
      seeders: seedersMatch ? parseInt(seedersMatch[1]) : undefined,
      peers: peersMatch ? parseInt(peersMatch[1]) : undefined,
      infoHash: infoHashMatch?.[1]?.toLowerCase(),
      magnetUrl: magnetMatch?.[1],
      downloadUrl: link,
    });
  }
  
  return results;
}

/**
 * Search Torznab indexer
 */
export async function searchTorznab(
  config: TorznabConfig,
  params: TorznabSearchParams
): Promise<ParsedStream[]> {
  const url = new URL(config.url);
  url.searchParams.set('apikey', config.apiKey);
  url.searchParams.set('t', 'search');
  
  if (params.query) url.searchParams.set('q', params.query);
  if (params.imdbId) url.searchParams.set('imdbid', params.imdbId);
  if (params.tvdbId) url.searchParams.set('tvdbid', params.tvdbId.toString());
  if (params.season) url.searchParams.set('season', params.season.toString());
  if (params.episode) url.searchParams.set('ep', params.episode.toString());
  if (params.categories?.length) {
    url.searchParams.set('cat', params.categories.join(','));
  }
  if (params.limit) url.searchParams.set('limit', params.limit.toString());
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/xml, application/rss+xml',
        'User-Agent': 'AIOStreams-Workers/1.0',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Torznab API error: ${response.status}`);
    }
    
    const xml = await response.text();
    const results = parseTorznabXml(xml);
    
    return results.map(result => parseTorznabResult(result, config.name || 'Torznab'));
  } catch (error: any) {
    console.error('Torznab search error:', error);
    throw error;
  }
}

/**
 * Parse a Torznab result into a ParsedStream
 */
function parseTorznabResult(result: TorznabResult, addonName: string): ParsedStream {
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
  
  // Determine URL and source type
  let url = result.magnetUrl || result.downloadUrl || result.link;
  let infoHash = result.infoHash;
  
  // Extract info hash from magnet if not provided
  if (!infoHash && url.startsWith('magnet:')) {
    const hashMatch = url.match(/btih:([a-fA-F0-9]{40})/i);
    infoHash = hashMatch?.[1]?.toLowerCase();
  }
  
  return {
    addon: addonName,
    source: 'torrent',
    infoHash,
    url,
    filename: title,
    size: result.size,
    seeders: result.seeders,
    leechers: result.peers ? result.peers - (result.seeders || 0) : undefined,
    resolution,
    quality,
    codec,
    audio,
    indexer: addonName,
  };
}

/**
 * Category constants for Torznab
 */
export const TORZNAB_CATEGORIES = {
  MOVIES: 2000,
  MOVIES_FOREIGN: 2010,
  MOVIES_OTHER: 2020,
  MOVIES_SD: 2030,
  MOVIES_HD: 2040,
  MOVIES_UHD: 2045,
  MOVIES_BLURAY: 2050,
  MOVIES_3D: 2060,
  MOVIES_WEBDL: 2070,
  TV: 5000,
  TV_WEBDL: 5010,
  TV_FOREIGN: 5020,
  TV_SD: 5030,
  TV_HD: 5040,
  TV_UHD: 5045,
  TV_OTHER: 5050,
  TV_SPORT: 5060,
  TV_ANIME: 5070,
  TV_DOCUMENTARY: 5080,
};
