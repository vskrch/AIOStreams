/**
 * Workers-compatible cache utility using Cloudflare KV
 */

export interface CacheOptions {
  /** Time-to-live in seconds */
  ttl?: number;
  /** Metadata to store with the value */
  metadata?: Record<string, string>;
}

export class KVCache<V = unknown> {
  constructor(
    private kv: KVNamespace,
    private prefix: string = ''
  ) {}

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Get a value from the cache
   */
  async get(key: string): Promise<V | null> {
    const fullKey = this.getKey(key);
    const value = await this.kv.get(fullKey, 'json');
    return value as V | null;
  }

  /**
   * Get a value with its metadata
   */
  async getWithMetadata(key: string): Promise<{
    value: V | null;
    metadata: Record<string, string> | null;
  }> {
    const fullKey = this.getKey(key);
    const result = await this.kv.getWithMetadata<V, Record<string, string>>(fullKey, 'json');
    return {
      value: result.value,
      metadata: result.metadata,
    };
  }

  /**
   * Set a value in the cache
   */
  async set(key: string, value: V, options: CacheOptions = {}): Promise<void> {
    const fullKey = this.getKey(key);
    await this.kv.put(fullKey, JSON.stringify(value), {
      expirationTtl: options.ttl,
      metadata: options.metadata,
    });
  }

  /**
   * Delete a value from the cache
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.getKey(key);
    await this.kv.delete(fullKey);
  }

  /**
   * List keys with a given prefix
   */
  async list(options: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<{
    keys: string[];
    cursor?: string;
    complete: boolean;
  }> {
    const result = await this.kv.list({
      prefix: this.getKey(options.prefix || ''),
      limit: options.limit,
      cursor: options.cursor,
    });

    return {
      keys: result.keys.map(k => k.name.slice(this.prefix.length)),
      cursor: 'cursor' in result ? (result as any).cursor : undefined,
      complete: result.list_complete,
    };
  }

  /**
   * Wrap a function with caching
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached as unknown as T;
    }

    const result = await fn();
    
    // Don't cache empty arrays
    if (Array.isArray(result) && result.length === 0) {
      return result;
    }

    await this.set(key, result as unknown as V, { ttl });
    return result;
  }
}

/**
 * D1 SQL-based cache for larger values or when KV is not suitable
 */
export class D1Cache<V = unknown> {
  constructor(
    private db: D1Database,
    private tableName: string = 'cache'
  ) {}

  /**
   * Initialize the cache table
   */
  async initialize(): Promise<void> {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `).run();

    await this.db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_expires 
      ON ${this.tableName}(expires_at)
    `).run();
  }

  /**
   * Get a value from the cache
   */
  async get(key: string): Promise<V | null> {
    const now = Math.floor(Date.now() / 1000);
    
    const result = await this.db.prepare(`
      SELECT value FROM ${this.tableName} 
      WHERE key = ? AND expires_at > ?
    `).bind(key, now).first<{ value: string }>();

    if (!result) {
      return null;
    }

    try {
      return JSON.parse(result.value) as V;
    } catch {
      return null;
    }
  }

  /**
   * Set a value in the cache
   */
  async set(key: string, value: V, ttl: number): Promise<void> {
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;
    const jsonValue = JSON.stringify(value);

    await this.db.prepare(`
      INSERT OR REPLACE INTO ${this.tableName} (key, value, expires_at)
      VALUES (?, ?, ?)
    `).bind(key, jsonValue, expiresAt).run();
  }

  /**
   * Delete a value from the cache
   */
  async delete(key: string): Promise<void> {
    await this.db.prepare(`
      DELETE FROM ${this.tableName} WHERE key = ?
    `).bind(key).run();
  }

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db.prepare(`
      DELETE FROM ${this.tableName} WHERE expires_at <= ?
    `).bind(now).run();
    
    return result.meta.changes || 0;
  }

  /**
   * Wrap a function with caching
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    const cached = await this.get(key);
    if (cached !== null) {
      return cached as unknown as T;
    }

    const result = await fn();
    
    if (Array.isArray(result) && result.length === 0) {
      return result;
    }

    await this.set(key, result as unknown as V, ttl);
    return result;
  }
}
