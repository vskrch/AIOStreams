import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';
import type { HonoEnv } from './bindings.js';

// Import route handlers
import { apiRoutes } from './routes/api/index.js';
import { stremioRoutes } from './routes/stremio/index.js';
import { builtinRoutes } from './routes/builtins/index.js';

// Create the main Hono app
const app = new Hono<HonoEnv>();

// Global middleware
app.use('*', timing());
app.use('*', logger());
app.use('*', secureHeaders());

// Request ID middleware
app.use('*', async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  await next();
});

// Client IP middleware
app.use('*', async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') || 
             c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || 
             'unknown';
  c.set('clientIp', ip);
  await next();
});

// CORS for Stremio routes
app.use('/stremio/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

// Mount route groups
app.route('/api/v1', apiRoutes);
app.route('/stremio', stremioRoutes);
app.route('/builtins', builtinRoutes);

// Root redirect
app.get('/', (c) => c.redirect('/stremio/configure'));

// Health check
app.get('/health', (c) => c.json({ 
  status: 'ok', 
  timestamp: new Date().toISOString(),
  runtime: 'cloudflare-workers'
}));

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    detail: 'Not Found',
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error(`[${c.get('requestId')}] Error:`, err);
  return c.json({
    success: false,
    detail: 'Internal Server Error',
    error: c.env.NODE_ENV === 'development' ? err.message : undefined,
  }, 500);
});

export default app;
