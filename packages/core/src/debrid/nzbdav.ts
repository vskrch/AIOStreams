import {
  Env,
  ServiceId,
  createLogger,
  getSimpleTextHash,
  Cache,
  DistributedLock,
  fromUrlSafeBase64,
  getTimeTakenSincePoint,
  maskSensitiveInfo,
} from '../utils/index.js';
import { isVideoFile, selectFileInTorrentOrNZB } from './utils.js';
import {
  DebridService,
  DebridServiceConfig,
  DebridDownload,
  PlaybackInfo,
  DebridError,
  DebridFile,
} from './base.js';
import { ParsedResult, parseTorrentTitle } from '@viren070/parse-torrent-title';
import z from 'zod';
import { createClient, WebDAVClient, FileStat } from 'webdav';
import { fetch } from 'undici';
import { BuiltinProxy } from '../proxy/builtin.js';

// Credit goes to Sanket9225 for the idea and inspiration
// https://github.com/Sanket9225/UsenetStreamer/blob/master/server.js

const logger = createLogger('nzbdav');

// Zod schemas for NzbDAV API responses
const AddUrlResponseSchema = z.object({
  status: z.boolean(),
  nzo_ids: z.array(z.string()).optional(),
  error: z.string().nullable().optional(),
});

const HistorySlotSchema = z.object({
  nzo_id: z.string(),
  status: z.string(),
  name: z.string().optional(),
  category: z.string().optional(),
  fail_message: z.string().optional(),
});

const HistoryResponseSchema = z.object({
  status: z.boolean(),
  history: z
    .object({
      slots: z.array(HistorySlotSchema),
    })
    .optional(),
  error: z.string().nullable().optional(),
});

// Transform API responses to camelCase
const transformAddUrlResponse = (
  data: z.infer<typeof AddUrlResponseSchema>
) => ({
  status: data.status,
  nzoIds: data.nzo_ids,
  error: data.error,
});

const transformHistorySlot = (slot: z.infer<typeof HistorySlotSchema>) => ({
  nzoId: slot.nzo_id,
  status: slot.status.toLowerCase(),
  name: slot.name,
  category: slot.category,
  failMessage: slot.fail_message,
});

const transformHistoryResponse = (
  data: z.infer<typeof HistoryResponseSchema>
) => ({
  status: data.status,
  history: {
    slots: data.history?.slots.map(transformHistorySlot) ?? [],
  },
  error: data.error,
});

class NzbDAVApi {
  constructor(
    private readonly nzbdavUrl: string,
    private readonly apiKey: string
  ) {}

  private async request<T extends z.ZodType>(
    params: Record<string, string>,
    schema: T,
    timeoutMs: number = 80000
  ): Promise<z.infer<T>> {
    const url = new URL(`${this.nzbdavUrl}/api`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    logger.debug(`Making Nzb DAV API request`, {
      ...params,
      apikey: maskSensitiveInfo(params.apikey),
      fullUrl: maskSensitiveInfo(url.toString()),
    });

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': this.apiKey,
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'manual',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new DebridError(`NzbDAV API error: ${response.statusText}`, {
          statusCode: response.status,
          statusText: response.statusText,
          code: 'UNKNOWN',
          headers: Object.fromEntries(response.headers.entries()),
          body: data,
          type: 'api_error',
        });
      }

      return schema.parse(data);
    } catch (error) {
      if (error instanceof DebridError) {
        throw error;
      }

      if (
        (error as Error).name === 'AbortError' ||
        (error as Error).name === 'TimeoutError'
      ) {
        throw new DebridError('Request timeout', {
          statusCode: 504,
          statusText: 'Gateway Timeout',
          code: 'UNKNOWN',
          headers: {},
          body: null,
          type: 'api_error',
          cause: error,
        });
      }

      throw new DebridError(`Request failed: ${(error as Error).message}`, {
        statusCode: 500,
        statusText: 'Internal Server Error',
        code: 'UNKNOWN',
        headers: {},
        body: error,
        type: 'api_error',
        cause: error,
      });
    }
  }

  async addUrl(
    nzbUrl: string,
    category: string,
    jobLabel: string
  ): Promise<{ nzoId: string }> {
    const params = {
      mode: 'addurl',
      apikey: this.apiKey,
      name: nzbUrl,
      cat: category,
      nzbname: jobLabel,
      output: 'json',
    };

    const parsed = await this.request(params, AddUrlResponseSchema, 80000);
    const transformed = transformAddUrlResponse(parsed);

    if (!transformed.status) {
      throw new DebridError(
        `Failed to queue NZB: ${transformed.error || 'Unknown error'}`,
        {
          statusCode: 400,
          statusText: 'Bad Request',
          code: 'UNKNOWN',
          headers: {},
          body: parsed,
          type: 'api_error',
        }
      );
    }

    const nzoId = transformed.nzoIds?.[0];
    if (!nzoId) {
      throw new DebridError('addurl succeeded but no nzo_id returned', {
        statusCode: 400,
        statusText: 'Bad Request',
        code: 'UNKNOWN',
        headers: {},
        body: parsed,
        type: 'api_error',
      });
    }

    logger.debug(`NZB job successfully added`, {
      nzoId,
    });
    return { nzoId };
  }

  async waitForHistorySlot(
    nzoId: string,
    category: string,
    timeoutMs: number = 80000,
    pollIntervalMs: number = 2000
  ): Promise<ReturnType<typeof transformHistorySlot>> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const params = {
        mode: 'history',
        apikey: this.apiKey,
        start: '0',
        limit: '50',
        nzo_ids: nzoId,
        category,
      };

      const parsed = await this.request(params, HistoryResponseSchema, 60000);
      const transformed = transformHistoryResponse(parsed);

      if (!transformed.status) {
        throw new DebridError(
          `Failed to query history: ${transformed.error || 'Unknown error'}`,
          {
            statusCode: 400,
            statusText: 'Bad Request',
            code: 'UNKNOWN',
            headers: {},
            body: parsed,
            type: 'api_error',
          }
        );
      }

      const slot = transformed.history.slots.find(
        (entry) => entry.nzoId === nzoId
      );

      if (slot) {
        if (slot.status === 'completed') {
          return slot;
        }
        if (slot.status === 'failed') {
          const failMessage = slot.failMessage || 'Unknown NZBDav error';
          throw new DebridError(`NZB failed: ${failMessage}`, {
            statusCode: 400,
            statusText: 'Bad Request',
            code: 'UNKNOWN',
            headers: {},
            body: { nzoId, category, failMessage },
            type: 'api_error',
          });
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new DebridError(
      'Timeout while waiting for NZB to become streamable',
      {
        statusCode: 504,
        statusText: 'Gateway Timeout',
        code: 'UNKNOWN',
        headers: {},
        body: { nzoId, category },
        type: 'api_error',
      }
    );
  }
}

export const NzbDavConfig = z.object({
  nzbdavUrl: z
    .string()
    .transform((s) => s.trim().replace(/^\/+/, '').replace(/\/+$/, '')),
  nzbdavApiKey: z.string(),
  webdavUser: z.string(),
  webdavPassword: z.string(),
  aiostreamsAuth: z.string(),
});

export class NzbDAVService implements DebridService {
  private readonly webdavClient: WebDAVClient;
  private readonly nzbdavApi: NzbDAVApi;
  private static playbackLinkCache = Cache.getInstance<string, string>(
    'nzbdav:link'
  );
  readonly supportsUsenet = true;
  readonly serviceName: ServiceId = 'nzbdav';

  private readonly auth: z.infer<typeof NzbDavConfig>;

  private static readonly MIN_FILE_SIZE = 500 * 1024 * 1024; // 500 MB
  private static readonly MAX_DEPTH = 6;

  constructor(private readonly config: DebridServiceConfig) {
    this.auth = NzbDavConfig.parse(JSON.parse(fromUrlSafeBase64(config.token)));
    this.webdavClient = createClient(`${this.auth.nzbdavUrl}/`, {
      username: this.auth.webdavUser,
      password: this.auth.webdavPassword,
    });
    this.nzbdavApi = new NzbDAVApi(this.auth.nzbdavUrl, this.auth.nzbdavApiKey);
  }

  private async collectFiles(
    path: string
  ): Promise<{ files: FileStat[]; depth: number }> {
    // First, try using deep mode (recursive)
    try {
      const contents = (await this.webdavClient.getDirectoryContents(path, {
        deep: true,
      })) as FileStat[];

      const files = contents.filter((item) => item.type === 'file');

      return { files, depth: 0 };
    } catch (error) {
      logger.warn(`Deep listing failed, falling back to manual traversal`, {
        path,
        error: (error as Error).message,
      });
      // Fall back to manual traversal
      return this.collectFilesManually(path, 0);
    }
  }

  private async collectFilesManually(
    path: string,
    currentDepth: number = 0
  ): Promise<{ files: FileStat[]; depth: number }> {
    if (currentDepth >= NzbDAVService.MAX_DEPTH) {
      logger.warn(`Max depth reached at ${path}`);
      return { files: [], depth: currentDepth };
    }

    let contents: FileStat[];
    try {
      contents = (await this.webdavClient.getDirectoryContents(
        path
      )) as FileStat[];
    } catch (error) {
      logger.error(`Failed to list directory ${path}`, { error });
      throw new DebridError(
        `Failed to list WebDAV directory: ${(error as Error).message}`,
        {
          statusCode: 500,
          statusText: 'Internal Server Error',
          code: 'UNKNOWN',
          headers: {},
          body: { path, error },
          type: 'api_error',
          cause: error,
        }
      );
    }

    const files = contents.filter((item) => item.type === 'file');
    const directories = contents.filter((item) => item.type === 'directory');

    // Check if we should stop traversing based on criteria
    const hasVideoFile = files.some((file) => isVideoFile(file));
    const hasLargeFile = files.some(
      (file) => file.size >= NzbDAVService.MIN_FILE_SIZE
    );

    // If we found video files or large files, we're in the right place
    if (hasVideoFile || hasLargeFile) {
      return { files, depth: currentDepth };
    }

    // If no directories exist, return the files we have
    if (directories.length === 0) {
      return { files, depth: currentDepth };
    }

    // Otherwise, recurse into subdirectories
    const allFiles: FileStat[] = [...files];

    for (const dir of directories) {
      const { files: subFiles } = await this.collectFilesManually(
        dir.filename,
        currentDepth + 1
      );
      currentDepth = currentDepth + 1;
      allFiles.push(...subFiles);

      // If we found video files or large files in a subdirectory, stop searching other directories
      const hasVideoInSub = subFiles.some((file) => isVideoFile(file));
      const hasLargeInSub = subFiles.some(
        (file) => file.size >= NzbDAVService.MIN_FILE_SIZE
      );

      if (hasVideoInSub || hasLargeInSub) {
        break;
      }
    }

    return { files: allFiles, depth: currentDepth };
  }

  public async listMagnets(): Promise<DebridDownload[]> {
    throw new Error('Unsupported operation');
  }

  public async checkMagnets(
    magnets: string[],
    sid?: string
  ): Promise<DebridDownload[]> {
    throw new Error('Unsupported operation');
  }

  public async addMagnet(magnet: string): Promise<DebridDownload> {
    throw new Error('Unsupported operation');
  }

  public async generateTorrentLink(
    link: string,
    clientIp?: string
  ): Promise<string> {
    throw new Error('Unsupported operation');
  }

  public async checkNzbs(hashes: string[]): Promise<DebridDownload[]> {
    // All NZBs are "cached" with NzbDAV since it's streaming-based
    return hashes.map((h, index) => ({
      id: index,
      status: 'cached',
      hash: h,
    }));
  }

  public async resolve(
    playbackInfo: PlaybackInfo,
    filename: string,
    cacheAndPlay: boolean
  ): Promise<string | undefined> {
    if (playbackInfo.type === 'torrent') {
      throw new Error('Unsupported operation');
    }
    const { result } = await DistributedLock.getInstance().withLock(
      `nzbdav:resolve:${playbackInfo.hash}:${playbackInfo.metadata?.season}:${playbackInfo.metadata?.episode}:${playbackInfo.metadata?.absoluteEpisode}:${filename}:${this.config.clientIp}:${this.config.token}`,
      () => this._resolve(playbackInfo, filename),
      {
        timeout: 120000,
        ttl: 10000,
      }
    );
    return result;
  }

  private async _resolve(
    playbackInfo: PlaybackInfo & { type: 'usenet' },
    filename: string
  ): Promise<string | undefined> {
    const { nzb, metadata, hash } = playbackInfo;

    const cacheKey = `${this.serviceName}:${this.config.token}:${this.config.clientIp}:${JSON.stringify(playbackInfo)}`;

    const cachedLink = await NzbDAVService.playbackLinkCache.get(cacheKey);

    if (cachedLink) {
      logger.debug(`Using cached link for ${nzb}`);
      return cachedLink;
    }

    logger.debug(`Resolving NZB`, {
      hash,
      filename,
      nzbUrl: maskSensitiveInfo(nzb),
    });

    const category = metadata?.season || metadata?.episode ? 'Tv' : 'Movies';

    // Add NZB and get nzoId
    const addResult = await this.nzbdavApi.addUrl(nzb, category, filename);
    const nzoId = addResult.nzoId;

    // Poll history until download is complete
    const pollStartTime = Date.now();
    const slot = await this.nzbdavApi.waitForHistorySlot(nzoId, category);

    const jobName = slot.name || filename;
    const jobCategory = slot.category || category;

    logger.debug(`NZB download completed`, {
      nzoId,
      jobName,
      jobCategory,
      time: getTimeTakenSincePoint(pollStartTime),
    });

    // Get list of all files in the content folder recursively, stopping when we find video files
    const contentPath = `/content/${jobCategory}/${jobName}`;
    const listStartTime = Date.now();

    const { files: allFiles, depth } = await this.collectFiles(contentPath);

    if (allFiles.length === 0) {
      throw new DebridError('No files found in NZB download', {
        statusCode: 400,
        statusText: 'Bad Request',
        code: 'NO_MATCHING_FILE',
        headers: {},
        body: { contentPath },
        type: 'api_error',
      });
    }

    const debridFiles: DebridFile[] = allFiles.map((file, index) => ({
      id: index,
      name: file.basename,
      size: file.size,
      path: file.filename,
      index,
    }));

    logger.debug(`Collected files from path`, {
      nzoId,
      jobName,
      contentPath,
      depth,
      time: getTimeTakenSincePoint(listStartTime),
      count: debridFiles.length,
      files: debridFiles.map((f) => f.name),
    });

    const debridDownload: DebridDownload = {
      id: nzoId,
      hash,
      name: jobName,
      status: 'downloaded' as const,
      files: debridFiles,
    };

    let selectedFile;

    if (debridFiles.length === 1) {
      selectedFile = debridFiles[0];
    } else {
      // Parse all file names for matching
      const allStrings = [jobName, ...debridFiles.map((f) => f.name ?? '')];
      const parseResults: ParsedResult[] = allStrings.map((string) =>
        parseTorrentTitle(string)
      );
      const parsedFiles = new Map<string, ParsedResult>();
      for (const [index, result] of parseResults.entries()) {
        parsedFiles.set(allStrings[index], result);
      }

      const nzbInfo = {
        type: 'usenet' as const,
        nzb,
        hash,
        title: jobName,
        metadata,
        size: debridFiles.reduce((sum, f) => sum + f.size, 0),
      };

      // Select a file based on the available metadata and files
      selectedFile = await selectFileInTorrentOrNZB(
        nzbInfo,
        debridDownload,
        parsedFiles,
        metadata
      );
    }

    if (!selectedFile) {
      throw new DebridError('No matching file found', {
        statusCode: 400,
        statusText: 'Bad Request',
        code: 'NO_MATCHING_FILE',
        headers: {},
        body: { availableFiles: debridFiles.map((f) => f.name) },
        type: 'api_error',
      });
    }

    logger.debug(`Selected file for playback`, {
      chosenFile: selectedFile.name,
      chosenPath: selectedFile.path,
      availableFiles: debridFiles.length,
    });

    const filePath = selectedFile.path || `${contentPath}/${selectedFile.name}`;
    let playbackLink = `${this.auth.nzbdavUrl}${filePath}`;
    // const playbackUrl = new URL(playbackLink);
    // playbackUrl.username = this.auth.webdavUser;
    // playbackUrl.password = encodeURIComponent(this.auth.webdavPassword);
    // playbackLink = playbackUrl.toString();

    logger.debug(`Generated playback link`, { playbackLink });

    // Cache the result
    await NzbDAVService.playbackLinkCache.set(
      cacheKey,
      playbackLink,
      Env.BUILTIN_DEBRID_PLAYBACK_LINK_CACHE_TTL
    );

    return playbackLink;
  }
}
