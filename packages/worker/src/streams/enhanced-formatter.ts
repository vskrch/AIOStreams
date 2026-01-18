/**
 * Enhanced Stream Formatter for Workers
 * 
 * Full template engine with conditionals, modifiers, and formatting.
 */

import { ParsedStream, StremioStream } from './types.js';

export interface FormatterConfig {
  nameTemplate: string;
  descriptionTemplate: string;
  showDebugInfo?: boolean;
}

type ModifierFn = (value: any, ...args: string[]) => string;

/**
 * Format modifiers for template values
 */
const MODIFIERS: Record<string, ModifierFn> = {
  // String modifiers
  upper: (v) => String(v).toUpperCase(),
  lower: (v) => String(v).toLowerCase(),
  trim: (v) => String(v).trim(),
  truncate: (v, len) => {
    const s = String(v);
    const l = parseInt(len) || 50;
    return s.length > l ? s.substring(0, l) + '...' : s;
  },
  
  // Number modifiers
  bytes: (v) => formatBytes(Number(v) || 0),
  gb: (v) => ((Number(v) || 0) / (1024 * 1024 * 1024)).toFixed(2) + ' GB',
  mb: (v) => ((Number(v) || 0) / (1024 * 1024)).toFixed(2) + ' MB',
  round: (v) => Math.round(Number(v) || 0).toString(),
  
  // Boolean modifiers
  istrue: (v) => v ? 'true' : 'false',
  yesno: (v) => v ? 'Yes' : 'No',
  icon: (v) => v ? '✓' : '✗',
  
  // Array modifiers
  join: (v, sep) => Array.isArray(v) ? v.join(sep || ', ') : String(v),
  first: (v) => Array.isArray(v) ? v[0] || '' : String(v),
  count: (v) => Array.isArray(v) ? v.length.toString() : '0',
  
  // Formatting modifiers
  emoji: (v) => getEmojiForValue(String(v)),
  flag: (v) => languageToFlag(String(v)),
  
  // Default value
  default: (v, def) => v || def || '',
  ifempty: (v, alt) => v ? String(v) : alt || '',
};

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 2 : 0) + ' ' + units[i];
}

/**
 * Get emoji for common values
 */
function getEmojiForValue(value: string): string {
  const lower = value.toLowerCase();
  const emojiMap: Record<string, string> = {
    // Cached status
    'true': '⚡',
    'false': '⏳',
    'cached': '⚡',
    'uncached': '⏳',
    
    // Quality
    '4k': '🎬',
    '2160p': '🎬',
    '1080p': '🔵',
    '720p': '🟢',
    '480p': '🟡',
    
    // HDR
    'dv': '🎬DV',
    'hdr10+': 'HDR10+',
    'hdr10': 'HDR10',
    'hdr': 'HDR',
    
    // Source
    'torrent': '🔗',
    'debrid': '⚡',
    'direct': '📥',
    'usenet': '📦',
  };
  
  return emojiMap[lower] || value;
}

/**
 * Convert language to flag emoji
 */
function languageToFlag(lang: string): string {
  const flags: Record<string, string> = {
    'english': '🇺🇸', 'eng': '🇺🇸', 'en': '🇺🇸',
    'spanish': '🇪🇸', 'spa': '🇪🇸', 'es': '🇪🇸',
    'french': '🇫🇷', 'fre': '🇫🇷', 'fra': '🇫🇷', 'fr': '🇫🇷',
    'german': '🇩🇪', 'ger': '🇩🇪', 'deu': '🇩🇪', 'de': '🇩🇪',
    'italian': '🇮🇹', 'ita': '🇮🇹', 'it': '🇮🇹',
    'portuguese': '🇧🇷', 'por': '🇧🇷', 'pt': '🇧🇷',
    'russian': '🇷🇺', 'rus': '🇷🇺', 'ru': '🇷🇺',
    'japanese': '🇯🇵', 'jpn': '🇯🇵', 'ja': '🇯🇵',
    'korean': '🇰🇷', 'kor': '🇰🇷', 'ko': '🇰🇷',
    'chinese': '🇨🇳', 'chi': '🇨🇳', 'zho': '🇨🇳', 'zh': '🇨🇳',
    'hindi': '🇮🇳', 'hin': '🇮🇳', 'hi': '🇮🇳',
    'arabic': '🇸🇦', 'ara': '🇸🇦', 'ar': '🇸🇦',
    'multi': '🌐', 'dual': '🌐',
  };
  
  return flags[lang.toLowerCase()] || lang.substring(0, 2).toUpperCase();
}

/**
 * Get value from stream using dot notation path
 */
function getStreamValue(stream: ParsedStream, path: string): any {
  const parts = path.split('.');
  let value: any = stream;
  
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    value = value[part];
  }
  
  return value;
}

/**
 * Apply modifiers to a value
 */
function applyModifiers(value: any, modifiers: string[]): string {
  let result = value;
  
  for (const mod of modifiers) {
    // Parse modifier with arguments: modifier(arg1,arg2)
    const match = mod.match(/^(\w+)(?:\(([^)]*)\))?$/);
    if (!match) continue;
    
    const [, name, argsStr] = match;
    const args = argsStr ? argsStr.split(',').map(a => a.trim()) : [];
    
    const modFn = MODIFIERS[name];
    if (modFn) {
      result = modFn(result, ...args);
    }
  }
  
  return result !== undefined && result !== null ? String(result) : '';
}

/**
 * Parse and evaluate a template expression
 */
function evaluateExpression(expr: string, stream: ParsedStream): string {
  // Variable with modifiers: {variable::modifier1::modifier2}
  const parts = expr.split('::');
  const varPath = parts[0].trim();
  const modifiers = parts.slice(1);
  
  // Special variables
  let value: any;
  switch (varPath) {
    case 'cached':
      value = stream.cached ? '⚡' : '⏳';
      break;
    case 'size':
      value = stream.size;
      break;
    case 'seeders':
      value = stream.seeders;
      break;
    case 'resolution':
      value = stream.resolution;
      break;
    case 'quality':
      value = stream.quality;
      break;
    case 'codec':
      value = stream.codec;
      break;
    case 'audio':
      value = stream.audio;
      break;
    case 'addon':
      value = stream.addon;
      break;
    case 'source':
      value = stream.source;
      break;
    case 'debrid':
      value = stream.debridService;
      break;
    case 'filename':
      value = stream.filename;
      break;
    case 'languages':
      value = stream.languages;
      break;
    case 'hdr':
      value = stream.hdr;
      break;
    case 'indexer':
      value = stream.indexer;
      break;
    case 'group':
      value = stream.releaseGroup;
      break;
    default:
      // Try dot notation
      value = getStreamValue(stream, varPath);
  }
  
  return applyModifiers(value, modifiers);
}

/**
 * Evaluate a conditional block
 */
function evaluateConditional(condition: string, stream: ParsedStream): boolean {
  // Simple variable existence check
  if (!condition.includes(' ')) {
    const value = evaluateExpression(condition, stream);
    return Boolean(value && value.trim() !== '' && value !== 'undefined');
  }
  
  // Comparison: variable == value, variable != value, variable > value, etc.
  const compMatch = condition.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (compMatch) {
    const [, leftExpr, op, rightExpr] = compMatch;
    const left = evaluateExpression(leftExpr.trim(), stream);
    const right = rightExpr.trim().replace(/^["']|["']$/g, ''); // Remove quotes
    
    switch (op) {
      case '==': return left === right;
      case '!=': return left !== right;
      case '>': return Number(left) > Number(right);
      case '<': return Number(left) < Number(right);
      case '>=': return Number(left) >= Number(right);
      case '<=': return Number(left) <= Number(right);
    }
  }
  
  return false;
}

/**
 * Process template string with variables, conditionals, and modifiers
 */
export function processTemplate(template: string, stream: ParsedStream): string {
  let result = template;
  
  // Process conditionals first: {if condition}...{endif}
  const conditionalRegex = /\{if\s+(.+?)\}([\s\S]*?)(?:\{else\}([\s\S]*?))?\{endif\}/g;
  result = result.replace(conditionalRegex, (_, condition, truePart, falsePart) => {
    const isTrue = evaluateConditional(condition, stream);
    return isTrue ? truePart : (falsePart || '');
  });
  
  // Process simple variables: {variable} or {variable::modifier}
  const varRegex = /\{([^{}]+)\}/g;
  result = result.replace(varRegex, (_, expr) => {
    return evaluateExpression(expr, stream);
  });
  
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
 * Format a stream using templates
 */
export function formatStream(
  stream: ParsedStream,
  config: FormatterConfig
): StremioStream {
  const name = processTemplate(config.nameTemplate, stream);
  const description = processTemplate(config.descriptionTemplate, stream);
  
  const result: StremioStream = {
    name,
    title: description,
    url: stream.url,
  };
  
  if (stream.infoHash) {
    result.infoHash = stream.infoHash;
  }
  
  if (stream.fileIdx !== undefined) {
    result.fileIdx = stream.fileIdx;
  }
  
  result.behaviorHints = {};
  
  if (stream.bingeGroup) {
    result.behaviorHints.bingeGroup = stream.bingeGroup;
  }
  
  if (stream.source === 'torrent' && stream.infoHash) {
    result.behaviorHints.notWebReady = true;
  }
  
  return result;
}

/**
 * Default templates
 */
export const DEFAULT_NAME_TEMPLATE = '{addon}';

export const DEFAULT_DESCRIPTION_TEMPLATE = 
  `{resolution} {quality} {codec} {audio}
{cached} {if hdr}{hdr::first} {endif}{if debrid}[{debrid}] {endif}
{size::bytes} | S:{seeders}`;

/**
 * Compact template preset
 */
export const COMPACT_TEMPLATE = {
  nameTemplate: '{addon}',
  descriptionTemplate: '{resolution} {cached} {size::bytes}',
};

/**
 * Detailed template preset
 */
export const DETAILED_TEMPLATE = {
  nameTemplate: '{addon} | {source::upper}',
  descriptionTemplate: 
    `📺 {resolution} {quality} {codec}
🔊 {audio} {if languages}{languages::join( )}{endif}
{if hdr}🎨 {hdr::join(/)}{endif}
{cached} {if debrid}{debrid::upper} {endif}| {size::bytes}
{if seeders}📊 S:{seeders}{endif}`,
};
