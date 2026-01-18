/**
 * Stream Formatter for Workers
 * 
 * Formats stream titles using a template system.
 */

import { ParsedStream, StremioStream } from './types.js';

export interface FormatConfig {
  // Title template with placeholders
  template: string;
  
  // Name format (usually addon name)
  nameTemplate?: string;
  
  // Whether to show detailed info
  showSize?: boolean;
  showSeeders?: boolean;
  showLanguages?: boolean;
  showHdr?: boolean;
}

/**
 * Default format template
 */
export const DEFAULT_FORMAT_TEMPLATE = 
  '{resolution} {quality} {codec} {audio}\n{cached} {addon} | {size} | S:{seeders}';

/**
 * Format file size as human readable string
 */
export function formatSize(bytes?: number): string {
  if (!bytes || bytes === 0) return '';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(unitIndex > 1 ? 2 : 0)} ${units[unitIndex]}`;
}

/**
 * Format languages as flag emojis or codes
 */
export function formatLanguages(languages?: string[]): string {
  if (!languages?.length) return '';
  
  const flagMap: Record<string, string> = {
    'english': '🇺🇸',
    'eng': '🇺🇸',
    'en': '🇺🇸',
    'spanish': '🇪🇸',
    'spa': '🇪🇸',
    'es': '🇪🇸',
    'french': '🇫🇷',
    'fre': '🇫🇷',
    'fra': '🇫🇷',
    'fr': '🇫🇷',
    'german': '🇩🇪',
    'ger': '🇩🇪',
    'deu': '🇩🇪',
    'de': '🇩🇪',
    'italian': '🇮🇹',
    'ita': '🇮🇹',
    'it': '🇮🇹',
    'portuguese': '🇧🇷',
    'por': '🇧🇷',
    'pt': '🇧🇷',
    'russian': '🇷🇺',
    'rus': '🇷🇺',
    'ru': '🇷🇺',
    'japanese': '🇯🇵',
    'jpn': '🇯🇵',
    'ja': '🇯🇵',
    'korean': '🇰🇷',
    'kor': '🇰🇷',
    'ko': '🇰🇷',
    'chinese': '🇨🇳',
    'chi': '🇨🇳',
    'zho': '🇨🇳',
    'zh': '🇨🇳',
    'hindi': '🇮🇳',
    'hin': '🇮🇳',
    'hi': '🇮🇳',
    'arabic': '🇸🇦',
    'ara': '🇸🇦',
    'ar': '🇸🇦',
    'dutch': '🇳🇱',
    'dut': '🇳🇱',
    'nld': '🇳🇱',
    'nl': '🇳🇱',
    'polish': '🇵🇱',
    'pol': '🇵🇱',
    'pl': '🇵🇱',
    'turkish': '🇹🇷',
    'tur': '🇹🇷',
    'tr': '🇹🇷',
    'swedish': '🇸🇪',
    'swe': '🇸🇪',
    'sv': '🇸🇪',
    'multi': '🌐',
    'dual': '🌐',
  };
  
  return languages
    .slice(0, 5) // Limit to 5 languages
    .map(lang => {
      const normalized = lang.toLowerCase().trim();
      return flagMap[normalized] || lang.substring(0, 2).toUpperCase();
    })
    .join(' ');
}

/**
 * Format HDR tags
 */
export function formatHdr(hdr?: string[]): string {
  if (!hdr?.length) return '';
  
  const hdrIcons: Record<string, string> = {
    'DV': '🎬DV',
    'Dolby Vision': '🎬DV',
    'HDR10+': 'HDR10+',
    'HDR10': 'HDR10',
    'HDR': 'HDR',
    'HLG': 'HLG',
  };
  
  return hdr
    .map(h => hdrIcons[h] || h)
    .join(' ');
}

/**
 * Format cached status
 */
export function formatCached(cached?: boolean): string {
  return cached ? '⚡' : '⏳';
}

/**
 * Format a stream title using a template
 */
export function formatStreamTitle(
  stream: ParsedStream,
  template: string = DEFAULT_FORMAT_TEMPLATE
): string {
  let result = template;
  
  // Replace all placeholders
  const replacements: Record<string, string> = {
    '{resolution}': stream.resolution || '',
    '{quality}': stream.quality || '',
    '{codec}': stream.codec || '',
    '{audio}': stream.audio || '',
    '{audioChannels}': stream.audioChannels || '',
    '{size}': formatSize(stream.size),
    '{seeders}': stream.seeders?.toString() || '',
    '{leechers}': stream.leechers?.toString() || '',
    '{addon}': stream.addon || '',
    '{source}': stream.source || '',
    '{cached}': formatCached(stream.cached),
    '{debrid}': stream.debridService || '',
    '{filename}': stream.filename || '',
    '{languages}': formatLanguages(stream.languages),
    '{hdr}': formatHdr(stream.hdr),
    '{indexer}': stream.indexer || '',
    '{group}': stream.releaseGroup || '',
  };
  
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replaceAll(placeholder, value);
  }
  
  // Clean up multiple spaces and empty lines
  result = result
    .replace(/  +/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .replace(/\|\s*\|/g, '|')
    .replace(/\|\s*$/gm, '')
    .replace(/^\s*\|/gm, '')
    .trim();
  
  return result;
}

/**
 * Convert a ParsedStream to a StremioStream
 */
export function toStremioStream(
  stream: ParsedStream,
  config: FormatConfig = { template: DEFAULT_FORMAT_TEMPLATE }
): StremioStream {
  const title = formatStreamTitle(stream, config.template);
  const name = config.nameTemplate
    ? formatStreamTitle(stream, config.nameTemplate)
    : stream.addon || 'AIOStreams';
  
  const result: StremioStream = {
    name,
    title,
    url: stream.url,
  };
  
  // Add optional properties
  if (stream.infoHash) {
    result.infoHash = stream.infoHash;
  }
  
  if (stream.fileIdx !== undefined) {
    result.fileIdx = stream.fileIdx;
  }
  
  // Add behavior hints
  result.behaviorHints = {};
  
  if (stream.bingeGroup) {
    result.behaviorHints.bingeGroup = stream.bingeGroup;
  }
  
  // Mark as not web ready if it's a torrent
  if (stream.source === 'torrent' && stream.infoHash) {
    result.behaviorHints.notWebReady = true;
  }
  
  return result;
}

/**
 * Transform multiple streams to Stremio format
 */
export function toStremioStreams(
  streams: ParsedStream[],
  config: FormatConfig = { template: DEFAULT_FORMAT_TEMPLATE }
): StremioStream[] {
  return streams.map(stream => toStremioStream(stream, config));
}

/**
 * Create an error stream for display in Stremio
 */
export function createErrorStream(error: {
  title: string;
  description?: string;
  url?: string;
}): StremioStream {
  return {
    name: '⚠️ Error',
    title: `${error.title}\n${error.description || ''}`.trim(),
    url: error.url || '#',
    behaviorHints: {
      notWebReady: true,
    },
  };
}
