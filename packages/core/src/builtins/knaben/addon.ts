import {
  BaseDebridAddon,
  BaseDebridConfigSchema,
  SearchMetadata,
} from '../base/debrid.js';
import { z } from 'zod';
import {
  createLogger,
  getTimeTakenSincePoint,
  ParsedId,
} from '../../utils/index.js';
import KnabenAPI, { KnabenCategory } from './api.js';
import { NZB, UnprocessedTorrent } from '../../debrid/utils.js';
import {
  extractInfoHashFromMagnet,
  extractTrackersFromMagnet,
} from '../utils/debrid.js';

const logger = createLogger('knaben');

export const KnabenAddonConfigSchema = BaseDebridConfigSchema;

export type KnabenAddonConfig = z.infer<typeof KnabenAddonConfigSchema>;

export class KnabenAddon extends BaseDebridAddon<KnabenAddonConfig> {
  readonly id = 'knaben';
  readonly name = 'Knaben';
  readonly version = '1.0.0';
  readonly logger = logger;
  readonly api: KnabenAPI;

  constructor(userData: KnabenAddonConfig, clientIp?: string) {
    super(userData, KnabenAddonConfigSchema, clientIp);
    this.api = new KnabenAPI();
  }

  protected async _searchNzbs(
    parsedId: ParsedId,
    metadata: SearchMetadata
  ): Promise<NZB[]> {
    return [];
  }

  protected async _searchTorrents(
    parsedId: ParsedId,
    metadata: SearchMetadata
  ): Promise<UnprocessedTorrent[]> {
    const queries = [];
    let categories: number[] = [];
    if (!metadata.primaryTitle) {
      return [];
    }

    if (parsedId.mediaType === 'movie') {
      categories.push(KnabenCategory.Movies);
      queries.push(`${metadata.primaryTitle} ${metadata.year}`);
    } else {
      categories.push(KnabenCategory.TV);
      if (metadata.isAnime) {
        categories.push(KnabenCategory.Anime);
      }
      if (metadata.absoluteEpisode) {
        queries.push(
          `${metadata.primaryTitle} ${metadata.absoluteEpisode.toString().padStart(2, '0')}`
        );
      }
      if (parsedId.season) {
        queries.push(
          `${metadata.primaryTitle} S${parsedId.season.toString().padStart(2, '0')}`
        );
      }
      if (parsedId.season && parsedId.episode) {
        queries.push(
          `${metadata.primaryTitle} S${parsedId.season.toString().padStart(2, '0')}E${parsedId.episode.toString().padStart(2, '0')}`
        );
      }
    }

    if (queries.length === 0) {
      return [];
    }

    logger.info(`Performing knaben search`, { queries, categories });

    const searchPromises = queries.map(async (q) => {
      const start = Date.now();
      const { hits } = await this.api.search({
        query: q,
        categories,
        size: 300,
        hideUnsafe: false,
      });
      logger.info(
        `Knaben search for ${q} took ${getTimeTakenSincePoint(start)}`,
        {
          results: hits.length,
        }
      );
      return hits;
    });

    const allResults = await Promise.all(searchPromises);
    const hits = allResults.flat();

    const seenTorrents = new Set<string>();
    const torrents: UnprocessedTorrent[] = [];
    for (const hit of hits) {
      const hash =
        hit.hash ??
        (hit.magnetUrl ? extractInfoHashFromMagnet(hit.magnetUrl) : undefined);
      if (!hash && !hit.link) {
        logger.warn(
          `Knaben search hit has no hash or download url: ${JSON.stringify(hit)}`
        );
        continue;
      }
      if (seenTorrents.has(hash ?? hit.link ?? '')) {
        continue;
      }
      let sources: string[] = [];
      if (hit.magnetUrl) {
        sources = extractTrackersFromMagnet(hit.magnetUrl);
      }

      torrents.push({
        hash: hash ?? undefined,
        downloadUrl: hit.link ?? undefined,
        sources,
        indexer: hit.tracker,
        seeders: hit.seeders,
        title: hit.title,
        size: hit.bytes,
        type: 'torrent',
      });
    }
    return torrents;
  }
}
