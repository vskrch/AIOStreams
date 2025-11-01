import { PARSE_REGEX } from './regex.js';
import { ParsedFile } from '../db/schemas.js';
// import ptt from './ptt.js';
// import { parseTorrentTitle } from './parse-torrent-title/index.js';
import { parseTorrentTitle } from '@viren070/parse-torrent-title';

function matchPattern(
  filename: string,
  patterns: Record<string, RegExp>
): string | undefined {
  return Object.entries(patterns).find(([_, pattern]) =>
    pattern.test(filename)
  )?.[0];
}

function matchMultiplePatterns(
  filename: string,
  patterns: Record<string, RegExp>
): string[] {
  return Object.entries(patterns)
    .filter(([_, pattern]) => pattern.test(filename))
    .map(([tag]) => tag);
}

class FileParser {
  static parse(filename: string): ParsedFile {
    const parsed = parseTorrentTitle(filename);
    if (
      ['vinland', 'furiosaamadmax', 'horizonanamerican'].includes(
        (parsed.title || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^\p{L}\p{N}+]/gu, '')
          .toLowerCase()
      ) &&
      parsed.complete
    ) {
      parsed.title += ' Saga';
    }
    // prevent the title from being parsed for info
    if (parsed.title && parsed.title.length > 4) {
      filename = filename.replace(parsed.title, '').trim();
      filename = filename.replace(/\s+/g, '.').replace(/^\.+|\.+$/g, '');
    }
    const resolution = matchPattern(filename, PARSE_REGEX.resolutions);
    const quality = matchPattern(filename, PARSE_REGEX.qualities);
    const encode = matchPattern(filename, PARSE_REGEX.encodes);
    const audioChannels = matchMultiplePatterns(
      filename,
      PARSE_REGEX.audioChannels
    );
    const visualTags = matchMultiplePatterns(filename, PARSE_REGEX.visualTags);
    const audioTags = matchMultiplePatterns(filename, PARSE_REGEX.audioTags);
    const languages = matchMultiplePatterns(filename, PARSE_REGEX.languages);

    const getPaddedNumber = (number: number, length: number) =>
      number.toString().padStart(length, '0');

    const releaseGroup =
      filename.match(PARSE_REGEX.releaseGroup)?.[1] ?? parsed.group;
    const title = parsed.title;
    const year = parsed.year ? parsed.year.toString() : undefined;
    // const season = parsed.season;
    // const seasons = parsed.seasons;
    // const episode = parsed.episode;
    // const formattedSeasonString = seasons?.length
    //   ? seasons.length === 1
    //     ? `S${getPaddedNumber(seasons[0], 2)}`
    //     : `S${getPaddedNumber(seasons[0], 2)}-${getPaddedNumber(
    //         seasons[seasons.length - 1],
    //         2
    //       )}`
    //   : season
    //     ? `S${getPaddedNumber(season, 2)}`
    //     : undefined;
    // const formattedEpisodeString = episode
    //   ? `E${getPaddedNumber(episode, 2)}`
    //   : undefined;

    // const seasonEpisode = [
    //   formattedSeasonString,
    //   formattedEpisodeString,
    // ].filter((v) => v !== undefined);
    const formattedSeasonString = parsed.seasons?.length
      ? parsed.seasons.length === 1
        ? `S${getPaddedNumber(parsed.seasons[0], 2)}`
        : `S${getPaddedNumber(parsed.seasons[0], 2)}-${getPaddedNumber(parsed.seasons[parsed.seasons.length - 1], 2)}`
      : undefined;
    const formattedEpisodeString = parsed.episodes?.length
      ? parsed.episodes.length === 1
        ? `E${getPaddedNumber(parsed.episodes[0], 2)}`
        : `E${getPaddedNumber(parsed.episodes[0], 2)}-${getPaddedNumber(parsed.episodes[parsed.episodes.length - 1], 2)}`
      : undefined;
    const seasonEpisode = [
      formattedSeasonString,
      formattedEpisodeString,
    ].filter((v) => v !== undefined);

    return {
      resolution,
      quality,
      languages,
      encode,
      audioChannels,
      audioTags,
      visualTags,
      releaseGroup,
      title,
      year,
      edition: parsed.edition,
      remastered: parsed.remastered ?? false,
      repack: parsed.repack ?? false,
      uncensored: parsed.uncensored ?? false,
      unrated: parsed.unrated ?? false,
      upscaled: parsed.upscaled ?? false,
      network: parsed.network,
      container: parsed.container,
      season: parsed.seasons?.[0],
      seasons: parsed.seasons,
      episode: parsed.episodes?.[0],
      seasonEpisode,
    };
  }
}

export default FileParser;
