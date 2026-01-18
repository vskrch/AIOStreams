/**
 * Catalog Fetcher for Workers
 * 
 * Fetches catalogs from external Stremio addons.
 */

export interface MetaPreview {
  id: string;
  type: string;
  name: string;
  poster?: string;
  posterShape?: 'square' | 'poster' | 'landscape';
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  genres?: string[];
  links?: Array<{ name: string; category: string; url: string }>;
}

export interface CatalogExtra {
  name: string;
  isRequired?: boolean;
  options?: string[];
}

export interface CatalogManifest {
  id: string;
  type: string;
  name: string;
  extra?: CatalogExtra[];
  genres?: string[];
  extraSupported?: string[];
  extraRequired?: string[];
}

export interface AddonCatalogConfig {
  name: string;
  url: string;
  timeout?: number;
}

export interface FetchCatalogOptions {
  timeout?: number;
  signal?: AbortSignal;
}

/**
 * Fetch a catalog from an addon
 */
export async function fetchCatalog(
  addon: AddonCatalogConfig,
  type: string,
  id: string,
  extra?: string,
  options: FetchCatalogOptions = {}
): Promise<{ metas: MetaPreview[]; error?: string }> {
  const timeout = options.timeout || addon.timeout || 15000;
  
  // Build the URL
  let url = `${addon.url.replace(/\/$/, '')}/catalog/${type}/${id}`;
  if (extra) {
    url += `/${extra}`;
  }
  url += '.json';
  
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
        metas: [],
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }
    
    const data = await response.json() as { metas?: MetaPreview[] };
    
    return { metas: data.metas || [] };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { metas: [], error: 'Request timed out' };
    }
    return { metas: [], error: error.message || 'Unknown error' };
  }
}

/**
 * Fetch catalogs from multiple addons and merge
 */
export async function fetchCatalogsFromAddons(
  addons: AddonCatalogConfig[],
  type: string,
  id: string,
  extra?: string,
  options: FetchCatalogOptions = {}
): Promise<{ metas: MetaPreview[]; errors: Array<{ addon: string; message: string }> }> {
  const results = await Promise.allSettled(
    addons.map(addon => fetchCatalog(addon, type, id, extra, options))
  );
  
  const allMetas: MetaPreview[] = [];
  const errors: Array<{ addon: string; message: string }> = [];
  const seenIds = new Set<string>();
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const addon = addons[i];
    
    if (result.status === 'fulfilled') {
      // Deduplicate by ID
      for (const meta of result.value.metas) {
        if (!seenIds.has(meta.id)) {
          seenIds.add(meta.id);
          allMetas.push(meta);
        }
      }
      if (result.value.error) {
        errors.push({ addon: addon.name, message: result.value.error });
      }
    } else {
      errors.push({
        addon: addon.name,
        message: result.reason?.message || 'Unknown error',
      });
    }
  }
  
  return { metas: allMetas, errors };
}

/**
 * Modify catalog results (shuffle, reverse, etc.)
 */
export function modifyCatalog(
  metas: MetaPreview[],
  options: {
    shuffle?: boolean;
    reverse?: boolean;
    limit?: number;
  }
): MetaPreview[] {
  let result = [...metas];
  
  if (options.shuffle) {
    // Fisher-Yates shuffle
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
  }
  
  if (options.reverse) {
    result = result.reverse();
  }
  
  if (options.limit && options.limit > 0) {
    result = result.slice(0, options.limit);
  }
  
  return result;
}

/**
 * Parse catalog extras string
 */
export function parseExtras(extra?: string): Record<string, string> {
  if (!extra) return {};
  
  const result: Record<string, string> = {};
  const parts = extra.split('&');
  
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) {
      result[key] = decodeURIComponent(value);
    }
  }
  
  return result;
}

/**
 * Build extras string from object
 */
export function buildExtras(extras: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  
  for (const [key, value] of Object.entries(extras)) {
    if (value !== undefined && value !== '') {
      parts.push(`${key}=${encodeURIComponent(String(value))}`);
    }
  }
  
  return parts.join('&');
}
