/**
 * Proxy Module Index
 * 
 * Unified proxy interface for MediaFlow and StremThru.
 */

import {
  createMediaFlowStreamUrl,
  createMediaFlowHlsUrl,
  createMediaFlowDashUrl,
  MediaFlowConfig,
} from './mediaflow.js';

import {
  createStremThruUrl,
  StremThruConfig,
} from './stremthru.js';

export * from './mediaflow.js';
export * from './stremthru.js';

export type ProxyType = 'mediaflow' | 'stremthru' | 'internal' | 'none';

export interface ProxyConfig {
  enabled: boolean;
  type: ProxyType;
  url?: string;
  publicUrl?: string;
  apiPassword?: string;
  apiToken?: string;
  proxiedServices?: string[];
}

/**
 * Determine stream type from URL
 */
function getStreamType(url: string): 'hls' | 'dash' | 'direct' {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes('.m3u8') || lowerUrl.includes('/manifest/hls')) {
    return 'hls';
  }
  
  if (lowerUrl.includes('.mpd') || lowerUrl.includes('/manifest/dash')) {
    return 'dash';
  }
  
  return 'direct';
}

/**
 * Create a proxied URL based on configuration
 */
export function proxyStreamUrl(
  streamUrl: string,
  config: ProxyConfig,
  options?: {
    service?: string;
    forceType?: 'hls' | 'dash' | 'direct';
  }
): string {
  // Check if proxy is enabled
  if (!config.enabled || config.type === 'none' || !config.url) {
    return streamUrl;
  }
  
  // Check if this service should be proxied
  if (config.proxiedServices?.length && options?.service) {
    if (!config.proxiedServices.includes(options.service)) {
      return streamUrl;
    }
  }
  
  const streamType = options?.forceType || getStreamType(streamUrl);
  
  switch (config.type) {
    case 'mediaflow': {
      const mfConfig: MediaFlowConfig = {
        url: config.url,
        publicUrl: config.publicUrl,
        apiPassword: config.apiPassword,
      };
      
      switch (streamType) {
        case 'hls':
          return createMediaFlowHlsUrl(streamUrl, mfConfig);
        case 'dash':
          return createMediaFlowDashUrl(streamUrl, mfConfig);
        default:
          return createMediaFlowStreamUrl(streamUrl, mfConfig);
      }
    }
    
    case 'stremthru': {
      const stConfig: StremThruConfig = {
        url: config.url,
        publicUrl: config.publicUrl,
        apiToken: config.apiToken,
      };
      
      return createStremThruUrl(streamUrl, stConfig);
    }
    
    case 'internal':
      // Internal proxy would be handled differently
      return streamUrl;
    
    default:
      return streamUrl;
  }
}

/**
 * Validate a proxy configuration
 */
export async function validateProxyConfig(config: ProxyConfig): Promise<{
  valid: boolean;
  error?: string;
}> {
  if (!config.enabled || config.type === 'none') {
    return { valid: true };
  }
  
  if (!config.url) {
    return { valid: false, error: 'Proxy URL is required' };
  }
  
  try {
    const testUrl = new URL(config.url);
    
    // Try to reach the proxy
    const response = await fetch(`${config.url}/health`, {
      method: 'GET',
    });
    
    if (!response.ok) {
      return { valid: false, error: 'Proxy health check failed' };
    }
    
    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message || 'Invalid proxy URL' };
  }
}
