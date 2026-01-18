/**
 * MediaFlow Proxy Integration for Workers
 * 
 * Creates proxy URLs for streaming through MediaFlow Proxy.
 */

export interface MediaFlowConfig {
  url: string;
  apiPassword?: string;
  publicUrl?: string;
}

/**
 * Create a MediaFlow proxy URL for a direct stream
 */
export function createMediaFlowStreamUrl(
  streamUrl: string,
  config: MediaFlowConfig
): string {
  const baseUrl = config.publicUrl || config.url;
  const url = new URL('/proxy/stream', baseUrl);
  
  url.searchParams.set('d', streamUrl);
  
  if (config.apiPassword) {
    url.searchParams.set('api_password', config.apiPassword);
  }
  
  return url.toString();
}

/**
 * Create a MediaFlow proxy URL for HLS streams
 */
export function createMediaFlowHlsUrl(
  manifestUrl: string,
  config: MediaFlowConfig
): string {
  const baseUrl = config.publicUrl || config.url;
  const url = new URL('/proxy/hls/manifest.m3u8', baseUrl);
  
  url.searchParams.set('d', manifestUrl);
  
  if (config.apiPassword) {
    url.searchParams.set('api_password', config.apiPassword);
  }
  
  return url.toString();
}

/**
 * Create a MediaFlow proxy URL for DASH streams
 */
export function createMediaFlowDashUrl(
  manifestUrl: string,
  config: MediaFlowConfig
): string {
  const baseUrl = config.publicUrl || config.url;
  const url = new URL('/proxy/mpd/manifest.mpd', baseUrl);
  
  url.searchParams.set('d', manifestUrl);
  
  if (config.apiPassword) {
    url.searchParams.set('api_password', config.apiPassword);
  }
  
  return url.toString();
}

/**
 * Validate a MediaFlow Proxy URL
 */
export async function validateMediaFlowUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, {
      method: 'GET',
    });
    
    return response.ok;
  } catch {
    return false;
  }
}
