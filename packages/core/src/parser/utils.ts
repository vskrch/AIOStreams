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

  const altTitleSeparators = ['/', ' aka '];
  for (const sep of altTitleSeparators) {
    if (
      preprocessedTitle?.toLowerCase().includes(sep) &&
      !titles.some((title) => title.toLowerCase().includes(sep))
    ) {
      preprocessedTitle =
        preprocessedTitle.split(sep)[0]?.trim() ?? preprocessedTitle;
      logger.debug(
        `Updated title from ${parsedTitle} to ${preprocessedTitle} because of ${sep}`
      );
      break;
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
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}+]/gu, '')
    .toLowerCase();
}

export function cleanTitle(title: string) {
  return title
    .normalize('NFD')
    .replace(/-/g, ' ')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}
