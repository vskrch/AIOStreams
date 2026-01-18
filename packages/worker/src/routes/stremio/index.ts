import { Hono } from 'hono';
import type { HonoEnv } from '../../bindings.js';
import { WorkersUserRepository } from '../../utils/user-repository.js';
import { fromUrlSafeBase64 } from '../../utils/crypto.js';
import {
  fetchFromAddons,
  filterStreams,
  sortStreams,
  deduplicateStreams,
  createErrorStream,
  DEFAULT_SORT_CONFIG,
  DEFAULT_DEDUPE_CONFIG,
  AddonConfig,
  FilterConfig,
  SortConfig,
  DeduplicationConfig,
  StremioStream,
  applyAdvancedFilters,
  buildAdvancedFilterConfig,
  formatStream,
  DEFAULT_NAME_TEMPLATE,
  DEFAULT_DESCRIPTION_TEMPLATE,
} from '../../streams/index.js';
import {
  fetchCatalogsFromAddons,
  fetchMetaFromAddons,
  modifyCatalog,
  parseExtras,
  AddonCatalogConfig,
  AddonMetaConfig,
  parseEpisodeId,
} from '../../catalog/index.js';
import { RealDebrid } from '../../debrid/index.js';
import { proxyStreamUrl, ProxyConfig } from '../../proxy/index.js';

const stremio = new Hono<HonoEnv>();

// Helper to get base URL
function getBaseUrl(c: any): string {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

// ==================== Public Routes ====================

// Manifest endpoint (public - no auth)
stremio.get('/manifest.json', (c) => {
  const baseUrl = getBaseUrl(c);
  
  return c.json({
    id: 'com.aiostreams.workers',
    version: '2.21.3',
    name: 'AIOStreams',
    description: 'AIOStreams consolidates multiple Stremio addons and debrid services into a single, easily configurable addon. (Workers Edition)',
    logo: `${baseUrl}/logo.png`,
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
    behaviorHints: {
      configurable: true,
      configurationRequired: true,
    },
  });
});

// Configure page
stremio.get('/configure', (c) => {
  const baseUrl = getBaseUrl(c);
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AIOStreams - Configure</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
          color: #fff;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container { max-width: 600px; padding: 2rem; text-align: center; }
        h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
        .subtitle { color: #888; margin-bottom: 2rem; }
        .card {
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          padding: 2rem;
          margin-bottom: 1.5rem;
        }
        .card h2 { margin-bottom: 1rem; font-size: 1.25rem; }
        .card p { color: #ccc; line-height: 1.6; }
        .badge {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.875rem;
          margin-top: 1rem;
        }
        code {
          background: rgba(0,0,0,0.3);
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.875rem;
        }
        .endpoint {
          background: rgba(0,0,0,0.3);
          padding: 1rem;
          border-radius: 8px;
          margin-top: 1rem;
          word-break: break-all;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 AIOStreams</h1>
        <p class="subtitle">Cloudflare Workers Edition</p>
        
        <div class="card">
          <h2>📡 Status</h2>
          <p>The Workers version is fully operational with advanced streaming functionality.</p>
          <span class="badge">Workers Runtime v2.21.3</span>
        </div>
        
        <div class="card">
          <h2>🔧 Features</h2>
          <p>✅ Real-Debrid Integration<br>
          ✅ Stream Filtering & Sorting<br>
          ✅ Multiple Built-in Addons<br>
          ✅ Catalog Support<br>
          ✅ Proxy Support</p>
        </div>
        
        <div class="card">
          <h2>📚 API Endpoint</h2>
          <div class="endpoint">
            <code>${baseUrl}/api/v1/</code>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// ==================== User Data Middleware ====================

async function getUserData(c: any, uuid: string, encryptedPassword: string) {
  try {
    const password = fromUrlSafeBase64(encryptedPassword);
    const userRepo = new WorkersUserRepository(c.env.DB);
    const userData = await userRepo.getUser(uuid, password);
    
    if (!userData) return null;
    return userData;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
}

// ==================== Authenticated Manifest ====================

stremio.get('/:uuid/:password/manifest.json', async (c) => {
  const { uuid, password } = c.req.param();
  const userData = await getUserData(c, uuid, password);
  
  const baseUrl = getBaseUrl(c);
  
  if (!userData) {
    return c.json({
      id: 'com.aiostreams.workers',
      version: '2.21.3',
      name: 'AIOStreams',
      description: 'User not found. Please reconfigure.',
      logo: `${baseUrl}/logo.png`,
      resources: ['stream'],
      types: ['movie', 'series'],
      idPrefixes: ['tt'],
      catalogs: [],
      behaviorHints: { configurable: true, configurationRequired: true },
    });
  }
  
  const config = userData as any;
  
  // Build catalogs from user config
  const catalogs: any[] = [];
  if (config.catalogs && Array.isArray(config.catalogs)) {
    for (const cat of config.catalogs) {
      if (cat.enabled !== false) {
        catalogs.push({
          id: cat.id,
          type: cat.type,
          name: cat.name || cat.id,
          extra: cat.extra || [],
        });
      }
    }
  }
  
  return c.json({
    id: `com.aiostreams.workers.${uuid.substring(0, 12)}`,
    version: '2.21.3',
    name: config.addonName || 'AIOStreams',
    description: config.addonDescription || 'AIOStreams Cloudflare Workers Edition',
    logo: config.addonLogo || `${baseUrl}/logo.png`,
    resources: ['stream', 'catalog', 'meta'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs,
    behaviorHints: { configurable: true, configurationRequired: false },
  });
});

// ==================== Stream Endpoint ====================

stremio.get('/:uuid/:password/stream/:type/:id', async (c) => {
  const { uuid, password, type, id } = c.req.param();
  const userData = await getUserData(c, uuid, password);
  
  if (!userData) {
    return c.json({
      streams: [createErrorStream({ title: 'User not found', description: 'Please reconfigure.' })],
    });
  }
  
  const config = userData as any;
  const cleanId = id.replace('.json', '');
  
  try {
    // Build addon list
    const addons: AddonConfig[] = [];
    if (config.addons && Array.isArray(config.addons)) {
      for (const addon of config.addons) {
        if (addon.enabled !== false && addon.url) {
          addons.push({
            name: addon.name || 'External Addon',
            url: addon.url,
            timeout: addon.timeout || 15000,
          });
        }
      }
    }
    
    if (addons.length === 0) {
      return c.json({
        streams: [createErrorStream({ title: 'No addons configured', description: 'Add streaming addons in configuration.' })],
      });
    }
    
    // Fetch streams
    const { streams, errors } = await fetchFromAddons(addons, type, cleanId);
    
    if (streams.length === 0) {
      const errorStreams: StremioStream[] = errors.map(e => 
        createErrorStream({ title: `[❌] ${e.addon}`, description: e.message })
      );
      if (errorStreams.length === 0) {
        errorStreams.push(createErrorStream({ title: 'No streams found' }));
      }
      return c.json({ streams: errorStreams });
    }
    
    // Check Real-Debrid cache
    const rdApiKey = config.realDebrid?.apiKey || c.env.REALDEBRID_API_KEY;
    if (rdApiKey) {
      const rd = new RealDebrid({ apiKey: rdApiKey });
      const hashes = streams.map(s => s.infoHash).filter((h): h is string => !!h);
      
      if (hashes.length > 0) {
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
        } catch (e) {
          console.error('RD cache check error:', e);
        }
      }
    }
    
    // Apply advanced filters
    const advancedConfig = buildAdvancedFilterConfig(config.advancedFilters, type, cleanId);
    const { passed: advancedFiltered } = applyAdvancedFilters(streams, advancedConfig);
    
    // Apply basic filters
    const filterConfig: FilterConfig = {};
    if (config.filters) {
      if (config.filters.resolutions) filterConfig.resolutions = config.filters.resolutions;
      if (config.filters.qualities) filterConfig.qualities = config.filters.qualities;
      if (config.filters.languages) filterConfig.languages = config.filters.languages;
      if (config.filters.maxSize) filterConfig.maxSize = config.filters.maxSize;
      if (config.filters.minSize) filterConfig.minSize = config.filters.minSize;
      if (config.filters.minSeeders) filterConfig.minSeeders = config.filters.minSeeders;
      if (config.filters.cachedOnly) filterConfig.cachedOnly = config.filters.cachedOnly;
      if (config.filters.excludeKeywords) filterConfig.excludeKeywords = config.filters.excludeKeywords;
    }
    
    const { passed: filteredStreams } = filterStreams(advancedFiltered, filterConfig);
    
    // Sort
    const sortConfig: SortConfig = config.sorting || DEFAULT_SORT_CONFIG;
    const sortedStreams = sortStreams(filteredStreams, sortConfig);
    
    // Deduplicate
    const dedupeConfig: DeduplicationConfig = config.deduplication || DEFAULT_DEDUPE_CONFIG;
    const uniqueStreams = deduplicateStreams(sortedStreams, dedupeConfig);
    
    // Apply proxy if configured
    const proxyConfig: ProxyConfig = config.proxy || { enabled: false, type: 'none' };
    
    // Format streams
    const formatterConfig = {
      nameTemplate: config.format?.nameTemplate || DEFAULT_NAME_TEMPLATE,
      descriptionTemplate: config.format?.template || DEFAULT_DESCRIPTION_TEMPLATE,
    };
    
    const stremioStreams: StremioStream[] = uniqueStreams.map(stream => {
      // Apply proxy to URL
      if (proxyConfig.enabled && stream.url) {
        stream.url = proxyStreamUrl(stream.url, proxyConfig, { service: stream.debridService });
      }
      return formatStream(stream, formatterConfig);
    });
    
    // Add error streams at the end
    const errorStreams = errors.map(e => 
      createErrorStream({ title: `[⚠️] ${e.addon}`, description: e.message })
    );
    
    return c.json({ streams: [...stremioStreams, ...errorStreams] });
  } catch (error: any) {
    console.error('Stream error:', error);
    return c.json({
      streams: [createErrorStream({ title: 'Internal error', description: error.message })],
    });
  }
});

// ==================== Catalog Endpoint ====================

stremio.get('/:uuid/:password/catalog/:type/:id/:extra?', async (c) => {
  const { uuid, password, type, id } = c.req.param();
  const extra = c.req.param('extra');
  const userData = await getUserData(c, uuid, password);
  
  if (!userData) {
    return c.json({ metas: [] });
  }
  
  const config = userData as any;
  
  try {
    // Build addon list for catalogs
    const catalogAddons: AddonCatalogConfig[] = [];
    if (config.addons && Array.isArray(config.addons)) {
      for (const addon of config.addons) {
        if (addon.enabled !== false && addon.url && addon.catalogs !== false) {
          catalogAddons.push({
            name: addon.name || 'External Addon',
            url: addon.url,
            timeout: addon.timeout || 15000,
          });
        }
      }
    }
    
    if (catalogAddons.length === 0) {
      return c.json({ metas: [] });
    }
    
    // Parse extras
    const cleanExtra = extra?.replace('.json', '');
    
    // Fetch catalogs from all addons
    const { metas, errors } = await fetchCatalogsFromAddons(
      catalogAddons, type, id, cleanExtra
    );
    
    // Apply modifications (shuffle, limit, etc.)
    const catalogConfig = config.catalogs?.find((cat: any) => cat.id === id);
    const modifiedMetas = modifyCatalog(metas, {
      shuffle: catalogConfig?.shuffle,
      reverse: catalogConfig?.reverse,
      limit: catalogConfig?.limit,
    });
    
    return c.json({ metas: modifiedMetas });
  } catch (error: any) {
    console.error('Catalog error:', error);
    return c.json({ metas: [] });
  }
});

// ==================== Meta Endpoint ====================

stremio.get('/:uuid/:password/meta/:type/:id', async (c) => {
  const { uuid, password, type, id } = c.req.param();
  const userData = await getUserData(c, uuid, password);
  
  if (!userData) {
    return c.json({ meta: null });
  }
  
  const config = userData as any;
  const cleanId = id.replace('.json', '');
  
  try {
    // Build addon list for meta
    const metaAddons: AddonMetaConfig[] = [];
    if (config.addons && Array.isArray(config.addons)) {
      for (const addon of config.addons) {
        if (addon.enabled !== false && addon.url && addon.meta !== false) {
          metaAddons.push({
            name: addon.name || 'External Addon',
            url: addon.url,
            timeout: addon.timeout || 15000,
          });
        }
      }
    }
    
    if (metaAddons.length === 0) {
      return c.json({ meta: null });
    }
    
    // Fetch meta from first addon that returns
    const { meta, source } = await fetchMetaFromAddons(metaAddons, type, cleanId);
    
    return c.json({ meta });
  } catch (error: any) {
    console.error('Meta error:', error);
    return c.json({ meta: null });
  }
});

// ==================== Subtitles Endpoint ====================

stremio.get('/:uuid/:password/subtitles/:type/:id/:extra?', async (c) => {
  const { uuid, password, type, id } = c.req.param();
  const userData = await getUserData(c, uuid, password);
  
  if (!userData) {
    return c.json({ subtitles: [] });
  }
  
  // TODO: Implement subtitle fetching from upstream addons
  // This would require fetching from OpenSubtitles or similar
  return c.json({ subtitles: [] });
});

// ==================== Addon Catalog Endpoint ====================

stremio.get('/:uuid/:password/addon_catalog/:type/:id/:extra?', async (c) => {
  const { uuid, password } = c.req.param();
  const userData = await getUserData(c, uuid, password);
  
  if (!userData) {
    return c.json({ addons: [] });
  }
  
  // Return empty - addon catalog is not typically used
  return c.json({ addons: [] });
});

export { stremio as stremioRoutes };
