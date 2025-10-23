import { extract, FuzzballExtractOptions } from 'fuzzball';
import { createLogger } from '../utils/index.js';

const logger = createLogger('parser');

export function titleMatch(
  parsedTitle: string,
  titles: string[],
  options: {
    threshold: number;
  } & Exclude<FuzzballExtractOptions, 'returnObjects'>
) {
  const { threshold, ...extractOptions } = options;

  const results = extract(parsedTitle, titles, {
    ...extractOptions,
    returnObjects: true,
  });

  const highestScore =
    results.reduce(
      (max: number, result: { choice: string; score: number; key: number }) => {
        return Math.max(max, result.score);
      },
      0
    ) / 100;

  return highestScore >= threshold;
}

export function preprocessTitle(
  parsedTitle: string,
  filename: string,
  titles: string[]
) {
  let preprocessedTitle = parsedTitle;

  const separatorPatterns = [
    /\s*\/\s*/,
    /[\s\.\-\(]*a[\s\.]?k[\s\.]?a[\s\.\)]*[\s\.\-]*/i,
  ];
  for (const pattern of separatorPatterns) {
    const match = preprocessedTitle.match(pattern);

    if (match) {
      // Check if any existing titles contain this separator pattern
      const hasExistingTitleWithSeparator = titles.some((title) =>
        pattern.test(title.toLowerCase())
      );

      if (!hasExistingTitleWithSeparator) {
        const parts = preprocessedTitle.split(pattern);
        if (parts.length > 1 && parts[0]?.trim()) {
          const originalTitle = preprocessedTitle;
          preprocessedTitle = parts[0].trim();
          logger.debug(
            `Updated title from "${originalTitle}" to "${preprocessedTitle}"`
          );
          break;
        }
      }
    }
  }

  if (
    titles.some((title) => title.toLowerCase().includes('saga')) &&
    filename?.toLowerCase().includes('saga') &&
    !preprocessedTitle.toLowerCase().includes('saga')
  ) {
    preprocessedTitle += ' Saga';
  }

  return preprocessedTitle;
}

export function normaliseTitle(title: string) {
  return title
    .replace(/&/g, 'and')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}+]/gu, '')
    .toLowerCase();
}

export function cleanTitle(title: string) {
  let cleaned = title.normalize('NFD');

  for (const char of ['♪', '♫', '★', '☆', '♡', '♥', '-']) {
    cleaned = cleaned.replaceAll(char, ' ');
  }

  return cleaned
    .replace(/&/g, 'and')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, '') // Remove remaining special chars
    .replace(/\s+/g, ' ') // Normalise spaces
    .toLowerCase()
    .trim();
}
