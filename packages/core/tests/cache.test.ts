import { describe, expect, it } from 'vitest'

// set required env vars before importing the cache module
process.env.SECRET_KEY = 'a'.repeat(64)
process.env.BASE_URL = 'http://localhost'

describe('Cache', () => {
  it('removes expired entries on access', async () => {
    const { Cache } = await import('../src/utils/cache')
    const cache = Cache.getInstance<string, number>('test-cache')
    cache.set('foo', 123, 0.05)
    expect(cache.get('foo')).toBe(123)
    await new Promise(r => setTimeout(r, 60))
    expect(cache.get('foo')).toBeUndefined()
  })
})
