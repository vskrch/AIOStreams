/**
 * Stream Sorter for Workers
 * 
 * Sorts streams based on user configuration and preferences.
 */

import { 
  ParsedStream, 
  RESOLUTION_RANK, 
  QUALITY_RANK, 
  AUDIO_RANK, 
  HDR_RANK,
  getRank 
} from './types.js';

export type SortField = 
  | 'resolution'
  | 'quality'
  | 'cached'
  | 'size'
  | 'seeders'
  | 'audio'
  | 'hdr'
  | 'addon';

export type SortDirection = 'asc' | 'desc';

export interface SortRule {
  field: SortField;
  direction?: SortDirection;
}

export interface SortConfig {
  // Sort order - array of fields to sort by
  sortBy: SortRule[];
  
  // Preferred values (sorted first)
  preferred?: {
    resolutions?: string[];
    qualities?: string[];
    audioTags?: string[];
    hdr?: string[];
    addons?: string[];
  };
  
  // Group cached streams first
  cachedFirst?: boolean;
  
  // Separate sort rules for cached vs uncached
  cachedSortBy?: SortRule[];
  uncachedSortBy?: SortRule[];
}

/**
 * Create rank map from preferred array
 */
function createPreferredRank(preferred: string[] | undefined): Record<string, number> {
  if (!preferred?.length) return {};
  
  const ranks: Record<string, number> = {};
  preferred.forEach((value, index) => {
    ranks[value.toLowerCase()] = index;
  });
  return ranks;
}

/**
 * Get rank with preferred values taking priority
 */
function getPreferredRank(
  value: string | undefined,
  preferred: Record<string, number>,
  defaultRanks: Record<string, number>
): number {
  if (!value) return 999;
  
  const normalized = value.toLowerCase();
  
  // Check preferred first
  if (normalized in preferred) {
    return preferred[normalized];
  }
  
  // Fall back to default ranks (offset by preferred length)
  const offset = Object.keys(preferred).length;
  const defaultRank = defaultRanks[value] ?? 99;
  return offset + defaultRank;
}

/**
 * Compare two streams by a single field
 */
function compareByField(
  a: ParsedStream,
  b: ParsedStream,
  rule: SortRule,
  preferredRanks: {
    resolutions: Record<string, number>;
    qualities: Record<string, number>;
    audioTags: Record<string, number>;
    hdr: Record<string, number>;
    addons: Record<string, number>;
  }
): number {
  const dir = rule.direction === 'asc' ? 1 : -1;
  let cmp = 0;
  
  switch (rule.field) {
    case 'resolution':
      cmp = getPreferredRank(a.resolution, preferredRanks.resolutions, RESOLUTION_RANK)
          - getPreferredRank(b.resolution, preferredRanks.resolutions, RESOLUTION_RANK);
      break;
      
    case 'quality':
      cmp = getPreferredRank(a.quality, preferredRanks.qualities, QUALITY_RANK)
          - getPreferredRank(b.quality, preferredRanks.qualities, QUALITY_RANK);
      break;
      
    case 'audio':
      cmp = getPreferredRank(a.audio, preferredRanks.audioTags, AUDIO_RANK)
          - getPreferredRank(b.audio, preferredRanks.audioTags, AUDIO_RANK);
      break;
      
    case 'hdr':
      const aHdr = a.hdr?.[0];
      const bHdr = b.hdr?.[0];
      cmp = getPreferredRank(aHdr, preferredRanks.hdr, HDR_RANK)
          - getPreferredRank(bHdr, preferredRanks.hdr, HDR_RANK);
      break;
      
    case 'cached':
      cmp = (b.cached ? 1 : 0) - (a.cached ? 1 : 0);
      break;
      
    case 'size':
      cmp = (b.size ?? 0) - (a.size ?? 0);
      break;
      
    case 'seeders':
      cmp = (b.seeders ?? 0) - (a.seeders ?? 0);
      break;
      
    case 'addon':
      const aAddonRank = preferredRanks.addons[a.addon.toLowerCase()] ?? 99;
      const bAddonRank = preferredRanks.addons[b.addon.toLowerCase()] ?? 99;
      cmp = aAddonRank - bAddonRank;
      break;
  }
  
  return cmp * dir;
}

/**
 * Sort streams based on configuration
 */
export function sortStreams(
  streams: ParsedStream[],
  config: SortConfig
): ParsedStream[] {
  // Prepare preferred rank maps
  const preferredRanks = {
    resolutions: createPreferredRank(config.preferred?.resolutions),
    qualities: createPreferredRank(config.preferred?.qualities),
    audioTags: createPreferredRank(config.preferred?.audioTags),
    hdr: createPreferredRank(config.preferred?.hdr),
    addons: createPreferredRank(config.preferred?.addons),
  };
  
  // If we have separate sort rules for cached/uncached, handle separately
  if (config.cachedSortBy && config.uncachedSortBy) {
    const cached = streams.filter(s => s.cached);
    const uncached = streams.filter(s => !s.cached);
    
    const sortedCached = sortByRules(cached, config.cachedSortBy, preferredRanks);
    const sortedUncached = sortByRules(uncached, config.uncachedSortBy, preferredRanks);
    
    if (config.cachedFirst) {
      return [...sortedCached, ...sortedUncached];
    }
    return [...sortedUncached, ...sortedCached];
  }
  
  // If cachedFirst is enabled, prepend cached sort
  let rules = [...config.sortBy];
  if (config.cachedFirst && !rules.some(r => r.field === 'cached')) {
    rules = [{ field: 'cached', direction: 'desc' }, ...rules];
  }
  
  return sortByRules(streams, rules, preferredRanks);
}

/**
 * Sort streams by rules
 */
function sortByRules(
  streams: ParsedStream[],
  rules: SortRule[],
  preferredRanks: {
    resolutions: Record<string, number>;
    qualities: Record<string, number>;
    audioTags: Record<string, number>;
    hdr: Record<string, number>;
    addons: Record<string, number>;
  }
): ParsedStream[] {
  return [...streams].sort((a, b) => {
    for (const rule of rules) {
      const cmp = compareByField(a, b, rule, preferredRanks);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

/**
 * Default sort configuration
 */
export const DEFAULT_SORT_CONFIG: SortConfig = {
  sortBy: [
    { field: 'cached', direction: 'desc' },
    { field: 'resolution', direction: 'desc' },
    { field: 'quality', direction: 'desc' },
    { field: 'seeders', direction: 'desc' },
  ],
  cachedFirst: true,
};
