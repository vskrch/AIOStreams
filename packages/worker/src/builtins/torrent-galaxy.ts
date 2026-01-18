/**
 * Torrent Galaxy Addon for Workers
 * 
 * Searches Torrent Galaxy for torrents.
 */

import { ParsedStream } from '../streams/types.js';

const TG_API = 'https://torrentgalaxy.to/get-posts/keywords';

export interface TorrentGalaxySearchParams {
  query: string;
  category?: 'movies' | 'tv' | 'anime' | 'all';
}

interface TGResult {
  title: string;
  torrent: string;
  magnet: string;
  size: string;
  seed: number;
  leech: number;
  uploader: string;
  date: string;
}

/**
 * Parse size string to bytes
 */
function parseSizeToBytes(sizeStr: string): number {
  const match = sizeStr.match(/([\d.]+)\s*(TB|GB|MB|KB|B)/i);
  if (!match) return 0;
  
  const num = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  const multipliers: Record<string, number> = {
    'TB': 1024 * 1024 * 1024 * 1024,
    'GB': 1024 * 1024 * 1024,
    'MB': 1024 * 1024,
    'KB': 1024,
    'B': 1,
  };
  
  return Math.round(num * (multipliers[unit] || 1));
}

/**
 * Extract info hash from magnet link
 */
function extractInfoHash(magnet: string): string | undefined {
  const match = magnet.match(/btih:([a-fA-F0-9]{40})/i);
  return match?.[1]?.toLowerCase();
}

/**
 * Search Torrent Galaxy
 */
export async function searchTorrentGalaxy(
  params: TorrentGalaxySearchParams
): Promise<ParsedStream[]> {
  const url = new URL(TG_API);
  url.searchParams.set('keywords', params.query);
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AIOStreams-Workers/1.0',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Torrent Galaxy error: ${response.status}`);
    }
    
    const results = await response.json() as TGResult[];
    
    return results
      .filter(r => r.magnet)
      .map(result => parseTGResult(result));
  } catch (error: any) {
    console.error('Torrent Galaxy search error:', error);
    throw error;
  }
}

/**
 * Parse a Torrent Galaxy result into a ParsedStream
 */
function parseTGResult(result: TGResult): ParsedStream {
  const title = result.title;
  const infoHash = extractInfoHash(result.magnet);
  
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
  
  return {
    addon: 'Torrent Galaxy',
    source: 'torrent',
    infoHash,
    url: result.magnet,
    filename: title,
    size: parseSizeToBytes(result.size),
    seeders: result.seed,
    leechers: result.leech,
    resolution,
    quality,
    codec,
    audio,
    indexer: 'Torrent Galaxy',
  };
}
