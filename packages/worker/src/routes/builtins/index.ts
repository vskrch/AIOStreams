import { Hono } from 'hono';
import type { HonoEnv } from '../../bindings.js';
import { searchKnaben, buildKnabenQuery } from '../../builtins/knaben.js';
import { searchTorrentGalaxy } from '../../builtins/torrent-galaxy.js';
import { searchAnimeTosho, buildAnimeToshoQuery } from '../../builtins/animetosho.js';
import { searchZilean, buildZileanQuery, ZileanConfig } from '../../builtins/zilean.js';
import { searchTorznab, TORZNAB_CATEGORIES, TorznabConfig } from '../../builtins/torznab.js';
import { searchProwlarr, ProwlarrConfig } from '../../builtins/prowlarr.js';
import { RealDebrid } from '../../debrid/realdebrid.js';
import {
  toStremioStreams,
  createErrorStream,
  DEFAULT_FORMAT_TEMPLATE,
  ParsedStream,
} from '../../streams/index.js';

const builtins = new Hono<HonoEnv>();

// Helper to parse Stremio ID
function parseStremioId(id: string): { imdbId: string; season?: number; episode?: number } {
  const cleanId = id.replace('.json', '');
  const parts = cleanId.split(':');
  
  return {
    imdbId: parts[0],
    season: parts[1] ? parseInt(parts[1]) : undefined,
    episode: parts[2] ? parseInt(parts[2]) : undefined,
  };
}

// Helper to check RD cache
async function checkRdCache(
  streams: ParsedStream[],
  rdApiKey: string | undefined
): Promise<void> {
  if (!rdApiKey || streams.length === 0) return;
  
  const rd = new RealDebrid({ apiKey: rdApiKey });
  const hashes = streams.map(s => s.infoHash).filter((h): h is string => !!h);
  
  if (hashes.length === 0) return;
  
  try {
    const cacheResults = await rd.checkCache(hashes);
    for (const stream of streams) {
      if (stream.infoHash) {
        const result = cacheResults.get(stream.infoHash.toLowerCase());
        if (result) {
          stream.cached = result.cached;
          stream.debridService = 'realdebrid';
        }
      }
    }
  } catch (error) {
    console.error('RD cache check error:', error);
  }
}

// ==================== Knaben ====================

builtins.get('/knaben/:type/:id', async (c) => {
  const { type, id } = c.req.param();
  const { imdbId, season, episode } = parseStremioId(id);
  
  try {
    const query = buildKnabenQuery(imdbId, type, season, episode);
    const category = type === 'movie' ? 'movies' : type === 'series' ? 'tv' : 'all';
    
    const streams = await searchKnaben({ query, category, limit: 50 });
    await checkRdCache(streams, c.env.REALDEBRID_API_KEY);
    
    const stremioStreams = toStremioStreams(streams, { template: DEFAULT_FORMAT_TEMPLATE });
    return c.json({ streams: stremioStreams });
  } catch (error: any) {
    return c.json({
      streams: [createErrorStream({ title: '[❌] Knaben', description: error.message })],
    });
  }
});

builtins.get('/knaben/manifest.json', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.json({
    id: 'com.aiostreams.workers.knaben',
    version: '1.0.0',
    name: 'AIOStreams Knaben',
    description: 'Search torrents via Knaben indexer',
    logo: `${baseUrl}/logo.png`,
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
  });
});

// ==================== Torrent Galaxy ====================

builtins.get('/torrentgalaxy/:type/:id', async (c) => {
  const { type, id } = c.req.param();
  const { imdbId, season, episode } = parseStremioId(id);
  
  try {
    let query = imdbId;
    if (type === 'series' && season !== undefined) {
      const seasonStr = season.toString().padStart(2, '0');
      if (episode !== undefined) {
        const episodeStr = episode.toString().padStart(2, '0');
        query = `${imdbId} S${seasonStr}E${episodeStr}`;
      } else {
        query = `${imdbId} S${seasonStr}`;
      }
    }
    
    const category = type === 'movie' ? 'movies' : type === 'series' ? 'tv' : 'all';
    const streams = await searchTorrentGalaxy({ query, category });
    await checkRdCache(streams, c.env.REALDEBRID_API_KEY);
    
    const stremioStreams = toStremioStreams(streams, { template: DEFAULT_FORMAT_TEMPLATE });
    return c.json({ streams: stremioStreams });
  } catch (error: any) {
    return c.json({
      streams: [createErrorStream({ title: '[❌] Torrent Galaxy', description: error.message })],
    });
  }
});

builtins.get('/torrentgalaxy/manifest.json', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.json({
    id: 'com.aiostreams.workers.torrentgalaxy',
    version: '1.0.0',
    name: 'AIOStreams Torrent Galaxy',
    description: 'Search torrents via Torrent Galaxy',
    logo: `${baseUrl}/logo.png`,
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
  });
});

// ==================== AnimeTosho ====================

builtins.get('/animetosho/:type/:id', async (c) => {
  const { type, id } = c.req.param();
  const { imdbId, season, episode } = parseStremioId(id);
  
  // AnimeTosho needs anime title, not IMDB ID
  const title = c.req.query('title') || imdbId;
  
  try {
    const query = buildAnimeToshoQuery(title, episode, season);
    const streams = await searchAnimeTosho({ query, limit: 50 });
    await checkRdCache(streams, c.env.REALDEBRID_API_KEY);
    
    const stremioStreams = toStremioStreams(streams, { template: DEFAULT_FORMAT_TEMPLATE });
    return c.json({ streams: stremioStreams });
  } catch (error: any) {
    return c.json({
      streams: [createErrorStream({ title: '[❌] AnimeTosho', description: error.message })],
    });
  }
});

builtins.get('/animetosho/manifest.json', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.json({
    id: 'com.aiostreams.workers.animetosho',
    version: '1.0.0',
    name: 'AIOStreams AnimeTosho',
    description: 'Search anime torrents via AnimeTosho',
    logo: `${baseUrl}/logo.png`,
    resources: ['stream'],
    types: ['series'],
    idPrefixes: ['tt', 'kitsu'],
    catalogs: [],
  });
});

// ==================== Zilean ====================

builtins.get('/zilean/:type/:id', async (c) => {
  const { type, id } = c.req.param();
  const { imdbId, season, episode } = parseStremioId(id);
  
  const zileanUrl = c.req.query('url') || c.env.ZILEAN_URL;
  if (!zileanUrl) {
    return c.json({
      streams: [createErrorStream({ title: '[❌] Zilean', description: 'Zilean URL not configured' })],
    });
  }
  
  try {
    const config: ZileanConfig = { url: zileanUrl };
    const params = buildZileanQuery(imdbId, type, season, episode);
    
    const streams = await searchZilean(config, params);
    await checkRdCache(streams, c.env.REALDEBRID_API_KEY);
    
    const stremioStreams = toStremioStreams(streams, { template: DEFAULT_FORMAT_TEMPLATE });
    return c.json({ streams: stremioStreams });
  } catch (error: any) {
    return c.json({
      streams: [createErrorStream({ title: '[❌] Zilean', description: error.message })],
    });
  }
});

builtins.get('/zilean/manifest.json', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.json({
    id: 'com.aiostreams.workers.zilean',
    version: '1.0.0',
    name: 'AIOStreams Zilean',
    description: 'Search DMM hashlist via Zilean',
    logo: `${baseUrl}/logo.png`,
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
  });
});

// ==================== Torznab (Jackett) ====================

builtins.get('/torznab/:type/:id', async (c) => {
  const { type, id } = c.req.param();
  const { imdbId, season, episode } = parseStremioId(id);
  
  const torznabUrl = c.req.query('url') || c.env.TORZNAB_URL;
  const torznabKey = c.req.query('apiKey') || c.env.TORZNAB_API_KEY;
  
  if (!torznabUrl || !torznabKey) {
    return c.json({
      streams: [createErrorStream({ title: '[❌] Torznab', description: 'Torznab URL and API key required' })],
    });
  }
  
  try {
    const config: TorznabConfig = {
      url: torznabUrl,
      apiKey: torznabKey,
      name: 'Jackett',
    };
    
    const categories = type === 'movie'
      ? [TORZNAB_CATEGORIES.MOVIES, TORZNAB_CATEGORIES.MOVIES_HD, TORZNAB_CATEGORIES.MOVIES_UHD]
      : [TORZNAB_CATEGORIES.TV, TORZNAB_CATEGORIES.TV_HD, TORZNAB_CATEGORIES.TV_UHD];
    
    const streams = await searchTorznab(config, {
      imdbId,
      season,
      episode,
      categories,
      limit: 50,
    });
    await checkRdCache(streams, c.env.REALDEBRID_API_KEY);
    
    const stremioStreams = toStremioStreams(streams, { template: DEFAULT_FORMAT_TEMPLATE });
    return c.json({ streams: stremioStreams });
  } catch (error: any) {
    return c.json({
      streams: [createErrorStream({ title: '[❌] Torznab', description: error.message })],
    });
  }
});

builtins.get('/torznab/manifest.json', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.json({
    id: 'com.aiostreams.workers.torznab',
    version: '1.0.0',
    name: 'AIOStreams Torznab',
    description: 'Search via Torznab-compatible indexer (Jackett)',
    logo: `${baseUrl}/logo.png`,
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
  });
});

// ==================== Prowlarr ====================

builtins.get('/prowlarr/:type/:id', async (c) => {
  const { type, id } = c.req.param();
  const { imdbId, season, episode } = parseStremioId(id);
  
  const prowlarrUrl = c.req.query('url') || c.env.PROWLARR_URL;
  const prowlarrKey = c.req.query('apiKey') || c.env.PROWLARR_API_KEY;
  
  if (!prowlarrUrl || !prowlarrKey) {
    return c.json({
      streams: [createErrorStream({ title: '[❌] Prowlarr', description: 'Prowlarr URL and API key required' })],
    });
  }
  
  try {
    const config: ProwlarrConfig = {
      url: prowlarrUrl,
      apiKey: prowlarrKey,
    };
    
    const streams = await searchProwlarr(config, {
      query: imdbId,
      type: type as 'movie' | 'series',
      season,
      episode,
      limit: 50,
    });
    await checkRdCache(streams, c.env.REALDEBRID_API_KEY);
    
    const stremioStreams = toStremioStreams(streams, { template: DEFAULT_FORMAT_TEMPLATE });
    return c.json({ streams: stremioStreams });
  } catch (error: any) {
    return c.json({
      streams: [createErrorStream({ title: '[❌] Prowlarr', description: error.message })],
    });
  }
});

builtins.get('/prowlarr/manifest.json', (c) => {
  const baseUrl = new URL(c.req.url).origin;
  return c.json({
    id: 'com.aiostreams.workers.prowlarr',
    version: '1.0.0',
    name: 'AIOStreams Prowlarr',
    description: 'Search via Prowlarr multi-indexer',
    logo: `${baseUrl}/logo.png`,
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
  });
});

// ==================== Real-Debrid Endpoints ====================

builtins.get('/realdebrid/validate', async (c) => {
  const apiKey = c.req.query('apiKey') || c.env.REALDEBRID_API_KEY;
  
  if (!apiKey) {
    return c.json({ success: false, error: 'API key required' }, 400);
  }
  
  try {
    const rd = new RealDebrid({ apiKey });
    const accountInfo = await rd.getAccountInfo();
    
    return c.json({
      success: true,
      data: {
        username: accountInfo.username,
        premium: accountInfo.premium,
        expiration: accountInfo.expiration,
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 401);
  }
});

builtins.post('/realdebrid/cache', async (c) => {
  const body = await c.req.json<{ hashes: string[]; apiKey?: string }>();
  const apiKey = body.apiKey || c.env.REALDEBRID_API_KEY;
  
  if (!apiKey) {
    return c.json({ success: false, error: 'API key required' }, 400);
  }
  
  if (!body.hashes || body.hashes.length === 0) {
    return c.json({ success: false, error: 'Hashes required' }, 400);
  }
  
  try {
    const rd = new RealDebrid({ apiKey });
    const results = await rd.checkCache(body.hashes);
    
    const cached: string[] = [];
    const uncached: string[] = [];
    
    for (const [hash, status] of results) {
      if (status.cached) {
        cached.push(hash);
      } else {
        uncached.push(hash);
      }
    }
    
    return c.json({ success: true, data: { cached, uncached } });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

builtins.post('/realdebrid/stream', async (c) => {
  const body = await c.req.json<{ hash: string; fileId?: number; apiKey?: string }>();
  const apiKey = body.apiKey || c.env.REALDEBRID_API_KEY;
  
  if (!apiKey) {
    return c.json({ success: false, error: 'API key required' }, 400);
  }
  
  if (!body.hash) {
    return c.json({ success: false, error: 'Hash required' }, 400);
  }
  
  try {
    const rd = new RealDebrid({ apiKey });
    const url = await rd.getStreamUrl(body.hash, body.fileId);
    
    if (!url) {
      return c.json({ success: false, error: 'Could not generate stream URL' }, 404);
    }
    
    return c.json({ success: true, data: { url } });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

export { builtins as builtinRoutes };
