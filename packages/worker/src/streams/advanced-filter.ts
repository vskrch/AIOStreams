/**
 * Advanced Stream Filter for Workers
 * 
 * Provides advanced filtering including title, year, and episode matching.
 */

import { ParsedStream } from './types.js';

export interface AdvancedFilterConfig {
  // Title matching
  titleMatching?: {
    enabled: boolean;
    strictMode?: boolean;
    expectedTitle?: string;
  };
  
  // Year matching
  yearMatching?: {
    enabled: boolean;
    expectedYear?: number;
    tolerance?: number; // Allow ±N years
  };
  
  // Episode matching (for series)
  episodeMatching?: {
    enabled: boolean;
    season?: number;
    episode?: number;
    absoluteEpisode?: number;
    excludeSeasonPacks?: boolean;
  };
  
  // Digital release check
  digitalReleaseCheck?: {
    enabled: boolean;
    releaseDate?: Date;
  };
  
  // Size range per resolution
  sizeRanges?: {
    '4K'?: { min?: number; max?: number };
    '1080p'?: { min?: number; max?: number };
    '720p'?: { min?: number; max?: number };
    '480p'?: { min?: number; max?: number };
  };
  
  // Age filter (days since upload)
  ageFilter?: {
    maxDays?: number;
    minDays?: number;
  };
}

/**
 * Normalize a title for comparison
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s+/g, '');
}

/**
 * Extract year from a string
 */
function extractYear(text: string): number | null {
  // Look for 4-digit years between 1900-2099
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0]) : null;
}

/**
 * Extract season and episode from a string
 */
function extractSeasonEpisode(text: string): {
  season?: number;
  episode?: number;
  isSeasonPack?: boolean;
} {
  const result: { season?: number; episode?: number; isSeasonPack?: boolean } = {};
  
  // S01E01 format
  const seMatch = text.match(/S(\d{1,2})E(\d{1,3})/i);
  if (seMatch) {
    result.season = parseInt(seMatch[1]);
    result.episode = parseInt(seMatch[2]);
    return result;
  }
  
  // Season pack: S01, Season 1, etc.
  const seasonPackMatch = text.match(/\b(?:S(\d{1,2})|Season\s*(\d{1,2}))\b(?!\s*E\d)/i);
  if (seasonPackMatch) {
    result.season = parseInt(seasonPackMatch[1] || seasonPackMatch[2]);
    result.isSeasonPack = true;
    return result;
  }
  
  // Episode only: E01, Ep01, Episode 1
  const epMatch = text.match(/\b(?:E|Ep|Episode)\s*(\d{1,3})\b/i);
  if (epMatch) {
    result.episode = parseInt(epMatch[1]);
    return result;
  }
  
  // Absolute episode: - 01, #01
  const absMatch = text.match(/[-#]\s*(\d{1,4})\b/);
  if (absMatch) {
    result.episode = parseInt(absMatch[1]);
    return result;
  }
  
  return result;
}

/**
 * Check if a stream matches title criteria
 */
function matchesTitle(
  stream: ParsedStream,
  expectedTitle: string,
  strictMode: boolean
): boolean {
  const filename = stream.filename || '';
  const normalizedFilename = normalizeTitle(filename);
  const normalizedExpected = normalizeTitle(expectedTitle);
  
  if (strictMode) {
    return normalizedFilename.includes(normalizedExpected);
  }
  
  // Loose matching - check if main words are present
  const expectedWords = expectedTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const filenameWords = filename.toLowerCase().split(/[\s._-]+/);
  
  const matchedWords = expectedWords.filter(word =>
    filenameWords.some(fw => fw.includes(word) || word.includes(fw))
  );
  
  // Require at least 50% of words to match
  return matchedWords.length >= expectedWords.length * 0.5;
}

/**
 * Check if a stream matches year criteria
 */
function matchesYear(
  stream: ParsedStream,
  expectedYear: number,
  tolerance: number = 0
): boolean {
  const filename = stream.filename || '';
  const extractedYear = extractYear(filename);
  
  if (!extractedYear) {
    return true; // Allow if no year found
  }
  
  return Math.abs(extractedYear - expectedYear) <= tolerance;
}

/**
 * Check if a stream matches episode criteria
 */
function matchesEpisode(
  stream: ParsedStream,
  config: AdvancedFilterConfig['episodeMatching']
): boolean {
  if (!config?.enabled) return true;
  
  const filename = stream.filename || '';
  const extracted = extractSeasonEpisode(filename);
  
  // Exclude season packs if configured
  if (config.excludeSeasonPacks && extracted.isSeasonPack) {
    return false;
  }
  
  // If we expect specific season/episode
  if (config.season !== undefined && config.episode !== undefined) {
    if (extracted.season !== undefined && extracted.episode !== undefined) {
      return extracted.season === config.season && extracted.episode === config.episode;
    }
    
    // Check absolute episode if provided
    if (config.absoluteEpisode !== undefined && extracted.episode !== undefined) {
      return extracted.episode === config.absoluteEpisode;
    }
    
    return true; // Allow if can't determine
  }
  
  // If we only expect a season
  if (config.season !== undefined && extracted.season !== undefined) {
    return extracted.season === config.season;
  }
  
  return true;
}

/**
 * Check if size is within range for resolution
 */
function matchesSizeRange(
  stream: ParsedStream,
  sizeRanges: AdvancedFilterConfig['sizeRanges']
): boolean {
  if (!sizeRanges || !stream.size || !stream.resolution) {
    return true;
  }
  
  const range = sizeRanges[stream.resolution as keyof typeof sizeRanges];
  if (!range) return true;
  
  if (range.min && stream.size < range.min) return false;
  if (range.max && stream.size > range.max) return false;
  
  return true;
}

/**
 * Apply advanced filters to streams
 */
export function applyAdvancedFilters(
  streams: ParsedStream[],
  config: AdvancedFilterConfig
): {
  passed: ParsedStream[];
  filtered: ParsedStream[];
  reasons: Map<ParsedStream, string[]>;
} {
  const passed: ParsedStream[] = [];
  const filtered: ParsedStream[] = [];
  const reasons = new Map<ParsedStream, string[]>();
  
  for (const stream of streams) {
    const streamReasons: string[] = [];
    let shouldKeep = true;
    
    // Title matching
    if (config.titleMatching?.enabled && config.titleMatching.expectedTitle) {
      if (!matchesTitle(
        stream,
        config.titleMatching.expectedTitle,
        config.titleMatching.strictMode || false
      )) {
        shouldKeep = false;
        streamReasons.push('Title mismatch');
      }
    }
    
    // Year matching
    if (shouldKeep && config.yearMatching?.enabled && config.yearMatching.expectedYear) {
      if (!matchesYear(
        stream,
        config.yearMatching.expectedYear,
        config.yearMatching.tolerance || 0
      )) {
        shouldKeep = false;
        streamReasons.push(`Year mismatch (expected ${config.yearMatching.expectedYear})`);
      }
    }
    
    // Episode matching
    if (shouldKeep && config.episodeMatching?.enabled) {
      if (!matchesEpisode(stream, config.episodeMatching)) {
        shouldKeep = false;
        if (config.episodeMatching.excludeSeasonPacks) {
          streamReasons.push('Season pack excluded');
        } else {
          streamReasons.push(
            `Episode mismatch (expected S${config.episodeMatching.season}E${config.episodeMatching.episode})`
          );
        }
      }
    }
    
    // Size range check
    if (shouldKeep && !matchesSizeRange(stream, config.sizeRanges)) {
      shouldKeep = false;
      streamReasons.push('Size out of range for resolution');
    }
    
    if (shouldKeep) {
      passed.push(stream);
    } else {
      filtered.push(stream);
      reasons.set(stream, streamReasons);
    }
  }
  
  return { passed, filtered, reasons };
}

/**
 * Build advanced filter config from user settings
 */
export function buildAdvancedFilterConfig(
  userConfig: any,
  type: string,
  id: string
): AdvancedFilterConfig {
  const config: AdvancedFilterConfig = {};
  
  // Parse ID for series info
  const idMatch = id.match(/^(tt\d+)(?::(\d+):(\d+))?/);
  if (idMatch && type === 'series') {
    config.episodeMatching = {
      enabled: true,
      season: idMatch[2] ? parseInt(idMatch[2]) : undefined,
      episode: idMatch[3] ? parseInt(idMatch[3]) : undefined,
      excludeSeasonPacks: userConfig?.excludeSeasonPacks !== false,
    };
  }
  
  // Title matching from user config
  if (userConfig?.titleMatching) {
    config.titleMatching = {
      enabled: userConfig.titleMatching.enabled !== false,
      strictMode: userConfig.titleMatching.strictMode || false,
      expectedTitle: userConfig.titleMatching.title,
    };
  }
  
  // Year matching from user config
  if (userConfig?.yearMatching) {
    config.yearMatching = {
      enabled: userConfig.yearMatching.enabled !== false,
      expectedYear: userConfig.yearMatching.year,
      tolerance: userConfig.yearMatching.tolerance || 1,
    };
  }
  
  // Size ranges
  if (userConfig?.sizeRanges) {
    config.sizeRanges = userConfig.sizeRanges;
  }
  
  return config;
}
