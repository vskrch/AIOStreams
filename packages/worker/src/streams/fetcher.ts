/**
 * Stream Fetcher for Workers
 * 
 * Fetches streams from external Stremio addons.
 */

import { ParsedStream, StreamResult, StreamError } from './types.js';

export interface AddonConfig {
  name: string;
  url: string;
  timeout?: number;
}

export interface FetchOptions {
  timeout?: number;
  signal?: AbortSignal;
}

/**
 * Parse an addon stream response into ParsedStream format
 */
function parseAddonStream(raw: any, addon: AddonConfig): ParsedStream | null {
  if (!raw || !raw.url) return null;
  
  // Extract resolution from name/title
  const text = `${raw.name || ''} ${raw.title || ''}`;
  
  const resolutionMatch = text.match(/\b(4K|2160p|1080p|720p|480p|360p)\b/i);
  const qualityMatch = text.match(/\b(BluRay|Remux|WEB-DL|WEBRip|HDRip|BRRip|DVDRip|HDTV|CAM|TS)\b/i);
  const codecMatch = text.match(/\b(x265|x264|HEVC|H\.?265|H\.?264|AV1|VP9)\b/i);
  const audioMatch = text.match(/\b(Atmos|TrueHD|DTS-HD(?:\s*MA)?|DTS|DD\+?|AAC|FLAC|MP3)\b/i);
  const sizeMatch = text.match(/(\d+(?:\.\d+)?)\s*(GB|MB|TB)/i);
  const seedersMatch = text.match(/(?:S|Seeds?)[\s:]*(\d+)/i);
  
  // Extract HDR info
  const hdr: string[] = [];
  if (/\bDV\b|Dolby\s*Vision/i.test(text)) hdr.push('DV');
  if (/\bHDR10\+/i.test(text)) hdr.push('HDR10+');
  else if (/\bHDR10\b/i.test(text)) hdr.push('HDR10');
  else if (/\bHDR\b/i.test(text)) hdr.push('HDR');
  
  // Calculate size in bytes
  let size: number | undefined;
  if (sizeMatch) {
    const num = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2].toUpperCase();
    const multipliers: Record<string, number> = {
      'TB': 1024 * 1024 * 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'MB': 1024 * 1024,
    };
    size = Math.round(num * (multipliers[unit] || 1));
  }
  
  return {
    addon: addon.name,
    addonUrl: addon.url,
    source: raw.infoHash ? 'torrent' : 'direct',
    url: raw.url,
    infoHash: raw.infoHash,
    fileIdx: raw.fileIdx,
    resolution: resolutionMatch?.[1]?.toUpperCase().replace('2160P', '4K'),
    quality: qualityMatch?.[1],
    codec: codecMatch?.[1],
    audio: audioMatch?.[1],
    hdr: hdr.length ? hdr : undefined,
    size,
    seeders: seedersMatch ? parseInt(seedersMatch[1]) : undefined,
    filename: raw.title || raw.name,
    bingeGroup: raw.behaviorHints?.bingeGroup,
    raw,
  };
}

/**
 * Fetch streams from a single addon
 */
export async function fetchFromAddon(
  addon: AddonConfig,
  type: string,
  id: string,
  options: FetchOptions = {}
): Promise<{ streams: ParsedStream[]; error?: string }> {
  const timeout = options.timeout || addon.timeout || 15000;
  
  // Build the URL
  const url = `${addon.url.replace(/\/$/, '')}/stream/${type}/${id}.json`;
  
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
        streams: [],
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const data = await response.json() as { streams?: any[] };
    
    if (!data.streams || !Array.isArray(data.streams)) {
      return { streams: [] };
    }
    
    const streams = data.streams
      .map(raw => parseAddonStream(raw, addon))
      .filter((s): s is ParsedStream => s !== null);
    
    return { streams };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { streams: [], error: 'Request timed out' };
    }
    return { streams: [], error: error.message || 'Unknown error' };
  }
}

/**
 * Fetch streams from multiple addons in parallel
 */
export async function fetchFromAddons(
  addons: AddonConfig[],
  type: string,
  id: string,
  options: FetchOptions = {}
): Promise<StreamResult> {
  const results = await Promise.allSettled(
    addons.map(addon => fetchFromAddon(addon, type, id, options))
  );
  
  const allStreams: ParsedStream[] = [];
  const errors: StreamError[] = [];
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const addon = addons[i];
    
    if (result.status === 'fulfilled') {
      allStreams.push(...result.value.streams);
      if (result.value.error) {
        errors.push({ addon: addon.name, message: result.value.error });
      }
    } else {
      errors.push({ 
        addon: addon.name, 
        message: result.reason?.message || 'Unknown error' 
      });
    }
  }
  
  return { streams: allStreams, errors };
}

/**
 * Parse addon URL to extract manifest info
 */
export async function fetchAddonManifest(url: string): Promise<{
  name: string;
  id: string;
  version: string;
  resources: string[];
  types: string[];
} | null> {
  try {
    const manifestUrl = `${url.replace(/\/$/, '')}/manifest.json`;
    const response = await fetch(manifestUrl, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) return null;
    
    const manifest = await response.json() as any;
    return {
      name: manifest.name,
      id: manifest.id,
      version: manifest.version,
      resources: manifest.resources?.map((r: any) => 
        typeof r === 'string' ? r : r.name
      ) || [],
      types: manifest.types || [],
    };
  } catch {
    return null;
  }
}
