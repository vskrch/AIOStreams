import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

process.env.SECRET_KEY = 'a'.repeat(64);
process.env.BASE_URL = 'http://localhost';

let app: any;
let Cache: any;

describe('Cache API', () => {
  beforeEach(async () => {
    const cacheMod = await import('../../core/src/utils/cache');
    Cache = cacheMod.Cache;
    const appMod = await import('../src/app');
    app = appMod.default;
    Cache.clearAllInstances();
  });

  it('returns cache stats and clears caches', async () => {
    const cacheA = Cache.getInstance<string, number>('test');
    cacheA.set('foo', 1, 10);

    let res = await request(app).get('/api/v1/cache/stats');
    expect(res.statusCode).toBe(200);
    const entry = res.body.data.find((s: any) => s.name === 'test');
    expect(entry.itemCount).toBe(1);

    await request(app).post('/api/v1/cache/clear').query({ name: 'test' });

    res = await request(app).get('/api/v1/cache/stats');
    const cleared = res.body.data.find((s: any) => s.name === 'test');
    expect(cleared.itemCount).toBe(0);

    Cache.getInstance<string, number>('test2').set('bar', 2, 10);
    await request(app).post('/api/v1/cache/clear');

    res = await request(app).get('/api/v1/cache/stats');
    expect(res.body.data.every((s: any) => s.itemCount === 0)).toBe(true);
  });
});
