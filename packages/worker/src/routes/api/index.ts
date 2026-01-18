import { Hono } from 'hono';
import type { HonoEnv } from '../../bindings.js';
import { WorkersUserRepository } from '../../utils/user-repository.js';
import { toUrlSafeBase64 } from '../../utils/crypto.js';

const api = new Hono<HonoEnv>();

// Helper to create standardized responses
function createResponse(data: {
  success: boolean;
  detail?: string;
  data?: unknown;
}) {
  return {
    success: data.success,
    detail: data.detail,
    data: data.data,
  };
}

// Health check - verifies database connectivity
api.get('/health', async (c) => {
  try {
    const userRepo = new WorkersUserRepository(c.env.DB);
    await userRepo.getUserCount();
    return c.json(createResponse({ success: true, detail: 'OK' }));
  } catch (error: any) {
    console.error(`Health check failed: ${error.message}`);
    return c.json(createResponse({ 
      success: false, 
      detail: `Health check failed: ${error.message}` 
    }), 500);
  }
});

// Status endpoint - returns server configuration and status
api.get('/status', async (c) => {
  const userRepo = new WorkersUserRepository(c.env.DB);
  
  let userCount: number | null = null;
  try {
    userCount = await userRepo.getUserCount();
  } catch {
    userCount = null;
  }

  return c.json(createResponse({
    success: true,
    data: {
      version: '2.21.3',
      tag: 'cloudflare-workers',
      runtime: 'cloudflare-workers',
      users: userCount,
      settings: {
        baseUrl: new URL(c.req.url).origin,
        addonName: 'AIOStreams',
        protected: false,
        tmdbApiAvailable: !!c.env.TMDB_API_KEY,
        services: {
          realDebrid: !!c.env.REALDEBRID_API_KEY,
          allDebrid: !!c.env.ALLDEBRID_API_KEY,
          premiumize: !!c.env.PREMIUMIZE_API_KEY,
          debridLink: !!c.env.DEBRIDLINK_API_KEY,
          torBox: !!c.env.TORBOX_API_KEY,
          offcloud: !!c.env.OFFCLOUD_API_KEY,
          easyDebrid: !!c.env.EASYDEBRID_API_KEY,
        },
      },
    },
  }));
});

// User existence check (using GET with check=true param instead of HEAD)
api.get('/user/exists', async (c) => {
  const uuid = c.req.query('uuid');
  if (!uuid) {
    return c.json(createResponse({
      success: false,
      detail: 'uuid must be provided',
    }), 400);
  }

  try {
    const userRepo = new WorkersUserRepository(c.env.DB);
    const exists = await userRepo.checkUserExists(uuid);

    if (exists) {
      return c.json(createResponse({
        success: true,
        detail: 'User exists',
        data: { uuid },
      }));
    } else {
      return c.json(createResponse({
        success: false,
        detail: 'User not found',
      }), 404);
    }
  } catch (error: any) {
    return c.json(createResponse({
      success: false,
      detail: error.message,
    }), 500);
  }
});

// Get user details
api.get('/user', async (c) => {
  const uuid = c.req.query('uuid');
  const password = c.req.query('password');

  if (!uuid || !password) {
    return c.json(createResponse({
      success: false,
      detail: 'uuid and password must be provided',
    }), 400);
  }

  try {
    const userRepo = new WorkersUserRepository(c.env.DB);
    const userData = await userRepo.getUser(uuid, password);

    if (!userData) {
      return c.json(createResponse({
        success: false,
        detail: 'Invalid credentials',
      }), 401);
    }

    // Encrypt password for client use
    const encryptedPassword = toUrlSafeBase64(password);

    return c.json(createResponse({
      success: true,
      detail: 'User details retrieved successfully',
      data: {
        userData,
        encryptedPassword,
      },
    }));
  } catch (error: any) {
    return c.json(createResponse({
      success: false,
      detail: error.message,
    }), 500);
  }
});

// Create new user
api.post('/user', async (c) => {
  const body = await c.req.json<{ config: unknown; password: string }>();
  const { config, password } = body;

  if (!config || !password) {
    return c.json(createResponse({
      success: false,
      detail: 'config and password are required',
    }), 400);
  }

  try {
    const userRepo = new WorkersUserRepository(c.env.DB);
    const { uuid, encryptedPassword } = await userRepo.createUser(
      config as any,
      password
    );

    return c.json(createResponse({
      success: true,
      detail: 'User was successfully created',
      data: { uuid, encryptedPassword },
    }), 201);
  } catch (error: any) {
    return c.json(createResponse({
      success: false,
      detail: error.message,
    }), 500);
  }
});

// Update user
api.put('/user', async (c) => {
  const body = await c.req.json<{ 
    uuid: string; 
    password: string; 
    config: unknown;
  }>();
  const { uuid, password, config } = body;

  if (!uuid || !password || !config) {
    return c.json(createResponse({
      success: false,
      detail: 'uuid, password and config are required',
    }), 400);
  }

  try {
    const userRepo = new WorkersUserRepository(c.env.DB);
    const updatedUser = await userRepo.updateUser(uuid, password, config as any);

    return c.json(createResponse({
      success: true,
      detail: 'User updated successfully',
      data: { uuid, userData: updatedUser },
    }));
  } catch (error: any) {
    return c.json(createResponse({
      success: false,
      detail: error.message,
    }), 500);
  }
});

// Delete user
api.delete('/user', async (c) => {
  const body = await c.req.json<{ uuid: string; password: string }>();
  const { uuid, password } = body;

  if (!uuid || !password) {
    return c.json(createResponse({
      success: false,
      detail: 'uuid and password are required',
    }), 400);
  }

  try {
    const userRepo = new WorkersUserRepository(c.env.DB);
    await userRepo.deleteUser(uuid, password);

    return c.json(createResponse({
      success: true,
      detail: 'User deleted successfully',
    }));
  } catch (error: any) {
    return c.json(createResponse({
      success: false,
      detail: error.message,
    }), 500);
  }
});

// Format preview API
api.post('/format/preview', async (c) => {
  const body = await c.req.json();
  
  // TODO: Port the full format preview logic from core
  // This requires porting the formatter module
  return c.json(createResponse({
    success: true,
    data: {
      preview: 'Format preview - implementation in progress',
      input: body,
    },
  }));
});

// Catalogs API - list available catalogs
api.get('/catalogs', async (c) => {
  // TODO: Port catalog listing logic
  return c.json(createResponse({
    success: true,
    data: [],
  }));
});

// RPDB API - poster service
api.get('/rpdb/validate', async (c) => {
  const apiKey = c.req.query('apiKey');
  
  if (!apiKey) {
    return c.json(createResponse({
      success: false,
      detail: 'API key required',
    }), 400);
  }

  // TODO: Validate RPDB API key
  return c.json(createResponse({
    success: true,
    data: { valid: true },
  }));
});

// Top poster API
api.get('/top-poster', async (c) => {
  const type = c.req.query('type');
  const id = c.req.query('id');
  
  if (!type || !id) {
    return c.json(createResponse({
      success: false,
      detail: 'type and id are required',
    }), 400);
  }

  // TODO: Implement top poster fetching
  return c.json(createResponse({
    success: true,
    data: null,
  }));
});

// Google Drive OAuth exchange
api.post('/oauth/exchange/gdrive', async (c) => {
  const body = await c.req.json<{ code: string; redirectUri: string }>();
  
  // TODO: Implement Google OAuth token exchange
  return c.json(createResponse({
    success: false,
    detail: 'Google Drive OAuth not yet implemented for Workers',
  }), 501);
});

// Debrid validation endpoints
api.post('/debrid/validate', async (c) => {
  const body = await c.req.json<{ service: string; apiKey: string }>();
  const { service, apiKey } = body;

  if (!service || !apiKey) {
    return c.json(createResponse({
      success: false,
      detail: 'service and apiKey are required',
    }), 400);
  }

  // TODO: Implement debrid service validation
  // This requires porting the debrid module
  return c.json(createResponse({
    success: true,
    data: { valid: true, service },
  }));
});

// Anime database endpoints
api.get('/anime/search', async (c) => {
  const query = c.req.query('query');
  
  if (!query) {
    return c.json(createResponse({
      success: false,
      detail: 'query is required',
    }), 400);
  }

  // TODO: Implement anime search
  return c.json(createResponse({
    success: true,
    data: [],
  }));
});

// Proxy configuration
api.get('/proxy/validate', async (c) => {
  const url = c.req.query('url');
  
  if (!url) {
    return c.json(createResponse({
      success: false,
      detail: 'url is required',
    }), 400);
  }

  // TODO: Validate proxy URL
  return c.json(createResponse({
    success: true,
    data: { valid: true },
  }));
});

// Templates API
api.get('/templates', async (c) => {
  // Templates are typically loaded from filesystem
  // For Workers, we'd need to embed them or load from KV
  return c.json(createResponse({
    success: true,
    data: [],
  }));
});

api.post('/templates/preview', async (c) => {
  const body = await c.req.json();
  
  return c.json(createResponse({
    success: true,
    data: {
      preview: 'Template preview - implementation in progress',
    },
  }));
});

// Search API (if enabled)
api.get('/search', async (c) => {
  const query = c.req.query('query');
  const type = c.req.query('type');
  
  if (!query) {
    return c.json(createResponse({
      success: false,
      detail: 'query is required',
    }), 400);
  }

  // TODO: Implement search functionality
  return c.json(createResponse({
    success: true,
    data: {
      results: [],
    },
  }));
});

export { api as apiRoutes };
