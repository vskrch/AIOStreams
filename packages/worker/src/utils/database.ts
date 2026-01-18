/**
 * Workers-compatible database utilities using Cloudflare D1
 */

export interface UserRecord {
  uuid: string;
  password_hash: string;
  config: string | null;
  created_at: number;
  updated_at: number;
  last_accessed: number;
}

export class UserRepository {
  constructor(private db: D1Database) {}

  /**
   * Initialize the users table
   */
  async initialize(): Promise<void> {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS users (
        uuid TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        config TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        last_accessed INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `).run();
  }

  /**
   * Find a user by UUID
   */
  async findByUuid(uuid: string): Promise<UserRecord | null> {
    const result = await this.db.prepare(
      'SELECT * FROM users WHERE uuid = ?'
    ).bind(uuid).first<UserRecord>();
    
    return result;
  }

  /**
   * Create a new user
   */
  async create(uuid: string, passwordHash: string, config?: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    
    await this.db.prepare(`
      INSERT INTO users (uuid, password_hash, config, created_at, updated_at, last_accessed)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(uuid, passwordHash, config || null, now, now, now).run();
  }

  /**
   * Update user configuration
   */
  async updateConfig(uuid: string, config: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    
    await this.db.prepare(`
      UPDATE users SET config = ?, updated_at = ? WHERE uuid = ?
    `).bind(config, now, uuid).run();
  }

  /**
   * Update last accessed timestamp
   */
  async updateLastAccessed(uuid: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    
    await this.db.prepare(`
      UPDATE users SET last_accessed = ? WHERE uuid = ?
    `).bind(now, uuid).run();
  }

  /**
   * Delete a user
   */
  async delete(uuid: string): Promise<void> {
    await this.db.prepare(
      'DELETE FROM users WHERE uuid = ?'
    ).bind(uuid).run();
  }

  /**
   * Prune users that haven't been accessed in X days
   */
  async pruneOldUsers(maxDays: number): Promise<number> {
    const cutoff = Math.floor(Date.now() / 1000) - (maxDays * 24 * 60 * 60);
    
    const result = await this.db.prepare(`
      DELETE FROM users WHERE last_accessed < ?
    `).bind(cutoff).run();
    
    return result.meta.changes || 0;
  }

  /**
   * Count total users
   */
  async count(): Promise<number> {
    const result = await this.db.prepare(
      'SELECT COUNT(*) as count FROM users'
    ).first<{ count: number }>();
    
    return result?.count || 0;
  }
}

/**
 * Generic database utilities
 */
export class Database {
  constructor(private db: D1Database) {}

  /**
   * Run a raw query
   */
  async query<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const bound = params.length ? stmt.bind(...params) : stmt;
    const result = await bound.all<T>();
    return result.results;
  }

  /**
   * Run a query that doesn't return results
   */
  async execute(sql: string, ...params: unknown[]): Promise<D1Result> {
    const stmt = this.db.prepare(sql);
    const bound = params.length ? stmt.bind(...params) : stmt;
    return bound.run();
  }

  /**
   * Get a single row
   */
  async first<T = unknown>(sql: string, ...params: unknown[]): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    const bound = params.length ? stmt.bind(...params) : stmt;
    return bound.first<T>();
  }

  /**
   * Run multiple statements in a batch
   */
  async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    return this.db.batch(statements);
  }
}
