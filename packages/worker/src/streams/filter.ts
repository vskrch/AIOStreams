/**
 * Stream Filter for Workers
 * 
 * Filters streams based on user configuration.
 */

import { ParsedStream } from './types.js';

export interface FilterRule {
  include?: string[];
  required?: string[];
  exclude?: string[];
}

export interface FilterConfig {
  // Video filters
  resolutions?: FilterRule;
  qualities?: FilterRule;
  codecs?: FilterRule;
  hdr?: FilterRule;
  
  // Audio filters
  audioTags?: FilterRule;
  audioChannels?: FilterRule;
  languages?: FilterRule;
  
  // Size filters
  maxSize?: number;
  minSize?: number;
  
  // Torrent filters
  minSeeders?: number;
  maxSeeders?: number;
  
  // Cache filters
  cachedOnly?: boolean;
  cachedOnlyForServices?: string[];
  
  // Keyword filters
  excludeKeywords?: string[];
  requiredKeywords?: string[];
  
  // Regex filters (advanced)
  excludePatterns?: string[];
  requiredPatterns?: string[];
  
  // Addon filters
  excludeAddons?: string[];
  
  // Source type filters
  excludeSources?: ('torrent' | 'usenet' | 'direct' | 'debrid')[];
}

export interface FilterResult {
  passed: ParsedStream[];
  filtered: ParsedStream[];
  reasons: Map<ParsedStream, string>;
}

/**
 * Apply a filter rule to a value
 */
function matchesRule(value: string | undefined, rule: FilterRule): boolean {
  if (!value) {
    // If no value, only fail if required is set
    return !rule.required?.length;
  }
  
  const normalizedValue = value.toLowerCase();
  
  // Check exclude first
  if (rule.exclude?.some(e => normalizedValue.includes(e.toLowerCase()))) {
    return false;
  }
  
  // Check required
  if (rule.required?.length) {
    if (!rule.required.some(r => normalizedValue.includes(r.toLowerCase()))) {
      return false;
    }
  }
  
  return true;
}

/**
 * Apply a filter rule to an array of values
 */
function matchesRuleArray(values: string[] | undefined, rule: FilterRule): boolean {
  if (!values?.length) {
    return !rule.required?.length;
  }
  
  const normalizedValues = values.map(v => v.toLowerCase());
  
  // Check exclude
  if (rule.exclude?.some(e => 
    normalizedValues.some(v => v.includes(e.toLowerCase()))
  )) {
    return false;
  }
  
  // Check required
  if (rule.required?.length) {
    if (!rule.required.some(r =>
      normalizedValues.some(v => v.includes(r.toLowerCase()))
    )) {
      return false;
    }
  }
  
  return true;
}

/**
 * Filter streams based on configuration
 */
export function filterStreams(
  streams: ParsedStream[],
  config: FilterConfig
): FilterResult {
  const passed: ParsedStream[] = [];
  const filtered: ParsedStream[] = [];
  const reasons = new Map<ParsedStream, string>();
  
  for (const stream of streams) {
    const reason = getFilterReason(stream, config);
    
    if (reason) {
      filtered.push(stream);
      reasons.set(stream, reason);
    } else {
      passed.push(stream);
    }
  }
  
  return { passed, filtered, reasons };
}

/**
 * Get the reason a stream would be filtered, or null if it passes
 */
function getFilterReason(stream: ParsedStream, config: FilterConfig): string | null {
  // Resolution filter
  if (config.resolutions && !matchesRule(stream.resolution, config.resolutions)) {
    return `Resolution "${stream.resolution}" filtered`;
  }
  
  // Quality filter
  if (config.qualities && !matchesRule(stream.quality, config.qualities)) {
    return `Quality "${stream.quality}" filtered`;
  }
  
  // Codec filter
  if (config.codecs && !matchesRule(stream.codec, config.codecs)) {
    return `Codec "${stream.codec}" filtered`;
  }
  
  // HDR filter
  if (config.hdr && !matchesRuleArray(stream.hdr, config.hdr)) {
    return `HDR "${stream.hdr?.join(', ')}" filtered`;
  }
  
  // Audio filter
  if (config.audioTags && !matchesRule(stream.audio, config.audioTags)) {
    return `Audio "${stream.audio}" filtered`;
  }
  
  // Language filter
  if (config.languages && !matchesRuleArray(stream.languages, config.languages)) {
    return `Languages "${stream.languages?.join(', ')}" filtered`;
  }
  
  // Size filter
  if (config.maxSize && stream.size && stream.size > config.maxSize) {
    return `Size ${stream.size} exceeds max ${config.maxSize}`;
  }
  if (config.minSize && stream.size && stream.size < config.minSize) {
    return `Size ${stream.size} below min ${config.minSize}`;
  }
  
  // Seeder filter
  if (config.minSeeders && (stream.seeders ?? 0) < config.minSeeders) {
    return `Seeders ${stream.seeders} below min ${config.minSeeders}`;
  }
  if (config.maxSeeders && stream.seeders && stream.seeders > config.maxSeeders) {
    return `Seeders ${stream.seeders} exceeds max ${config.maxSeeders}`;
  }
  
  // Cache filter
  if (config.cachedOnly && !stream.cached) {
    // Check if this applies to the stream's debrid service
    if (!config.cachedOnlyForServices?.length ||
        (stream.debridService && config.cachedOnlyForServices.includes(stream.debridService))) {
      return 'Not cached';
    }
  }
  
  // Keyword filters
  const filename = stream.filename?.toLowerCase() || '';
  
  if (config.excludeKeywords?.some(kw => filename.includes(kw.toLowerCase()))) {
    return `Contains excluded keyword`;
  }
  
  if (config.requiredKeywords?.length &&
      !config.requiredKeywords.some(kw => filename.includes(kw.toLowerCase()))) {
    return `Missing required keyword`;
  }
  
  // Regex filters
  if (config.excludePatterns?.length) {
    for (const pattern of config.excludePatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(filename)) {
          return `Matches excluded pattern: ${pattern}`;
        }
      } catch {
        // Invalid regex, skip
      }
    }
  }
  
  if (config.requiredPatterns?.length) {
    let matchesAny = false;
    for (const pattern of config.requiredPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(filename)) {
          matchesAny = true;
          break;
        }
      } catch {
        // Invalid regex, skip
      }
    }
    if (!matchesAny) {
      return `Does not match required patterns`;
    }
  }
  
  // Addon filter
  if (config.excludeAddons?.includes(stream.addon)) {
    return `Addon "${stream.addon}" excluded`;
  }
  
  // Source type filter
  if (config.excludeSources?.includes(stream.source)) {
    return `Source type "${stream.source}" excluded`;
  }
  
  return null;
}

export { getFilterReason };
