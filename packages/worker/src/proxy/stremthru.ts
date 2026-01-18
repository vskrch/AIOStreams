/**
 * StremThru Proxy Integration for Workers
 * 
 * Creates proxy URLs for streaming through StremThru.
 */

export interface StremThruConfig {
  url: string;
  apiToken?: string;
  publicUrl?: string;
}

/**
 * Create a StremThru proxy URL
 */
export function createStremThruUrl(
  streamUrl: string,
  config: StremThruConfig
): string {
  const baseUrl = config.publicUrl || config.url;
  const url = new URL('/v0/proxy', baseUrl);
  
  url.searchParams.set('url', streamUrl);
  
  if (config.apiToken) {
    url.searchParams.set('token', config.apiToken);
  }
  
  return url.toString();
}

/**
 * Create a StremThru store link URL
 */
export function createStremThruStoreUrl(
  magnetUrl: string,
  config: StremThruConfig
): string {
  const baseUrl = config.publicUrl || config.url;
  const url = new URL('/v0/store/link', baseUrl);
  
  url.searchParams.set('url', magnetUrl);
  
  if (config.apiToken) {
    url.searchParams.set('token', config.apiToken);
  }
  
  return url.toString();
}

/**
 * Validate a StremThru URL
 */
export async function validateStremThruUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/v0/health`, {
      method: 'GET',
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get StremThru supported stores
 */
export async function getStremThruStores(url: string): Promise<string[]> {
  try {
    const response = await fetch(`${url}/v0/store/list`);
    
    if (!response.ok) return [];
    
    const data = await response.json() as { stores: string[] };
    return data.stores || [];
  } catch {
    return [];
  }
}
