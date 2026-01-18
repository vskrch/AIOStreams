/**
 * Workers-Compatible User Repository
 * 
 * This module provides a D1-based user repository that matches the interface
 * of the original @aiostreams/core UserRepository but works with Cloudflare D1.
 */

import { hashPassword, verifyPassword, generateUUID } from './crypto.js';
import { toUrlSafeBase64, fromUrlSafeBase64 } from './crypto.js';

export interface UserConfig {
  uuid?: string;
  encryptedPassword?: string;
  [key: string]: unknown;
}

export interface UserRecord {
  uuid: string;
  password_hash: string;
  config: string | null;
  created_at: number;
  updated_at: number;
  last_accessed: number;
}

export class WorkersUserRepository {
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
   * Check if a user exists by UUID
   */
  async checkUserExists(uuid: string): Promise<boolean> {
    const result = await this.db.prepare(
      'SELECT 1 FROM users WHERE uuid = ?'
    ).bind(uuid).first();
    return !!result;
  }

  /**
   * Get user count
   */
  async getUserCount(): Promise<number> {
    const result = await this.db.prepare(
      'SELECT COUNT(*) as count FROM users'
    ).first<{ count: number }>();
    return result?.count || 0;
  }

  /**
   * Get user by UUID and password
   */
  async getUser(uuid: string, password: string): Promise<UserConfig | null> {
    const user = await this.db.prepare(
      'SELECT * FROM users WHERE uuid = ?'
    ).bind(uuid).first<UserRecord>();

    if (!user) {
      return null;
    }

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return null;
    }

    // Update last accessed
    await this.updateLastAccessed(uuid);

    // Parse and return config
    if (!user.config) {
      return { uuid };
    }

    try {
      const config = JSON.parse(user.config) as UserConfig;
      config.uuid = uuid;
      return config;
    } catch {
      return { uuid };
    }
  }

  /**
   * Create a new user
   */
  async createUser(
    config: UserConfig,
    password: string
  ): Promise<{ uuid: string; encryptedPassword: string }> {
    const uuid = generateUUID();
    const passwordHash = await hashPassword(password);
    const now = Math.floor(Date.now() / 1000);

    config.uuid = uuid;
    const configJson = JSON.stringify(config);

    await this.db.prepare(`
      INSERT INTO users (uuid, password_hash, config, created_at, updated_at, last_accessed)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(uuid, passwordHash, configJson, now, now, now).run();

    // Create encrypted password for client
    const encryptedPassword = await this.encryptPassword(password);

    return { uuid, encryptedPassword };
  }

  /**
   * Update user configuration
   */
  async updateUser(
    uuid: string,
    password: string,
    config: UserConfig
  ): Promise<UserConfig> {
    // Verify user exists and password is correct
    const user = await this.getUser(uuid, password);
    if (!user) {
      throw new Error('User not found or invalid password');
    }

    const now = Math.floor(Date.now() / 1000);
    config.uuid = uuid;
    const configJson = JSON.stringify(config);

    await this.db.prepare(`
      UPDATE users SET config = ?, updated_at = ? WHERE uuid = ?
    `).bind(configJson, now, uuid).run();

    return config;
  }

  /**
   * Delete a user
   */
  async deleteUser(uuid: string, password: string): Promise<void> {
    // Verify user exists and password is correct
    const user = await this.getUser(uuid, password);
    if (!user) {
      throw new Error('User not found or invalid password');
    }

    await this.db.prepare(
      'DELETE FROM users WHERE uuid = ?'
    ).bind(uuid).run();
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
   * Prune users that haven't been accessed in X days
   */
  async pruneUsers(maxDays: number): Promise<number> {
    const cutoff = Math.floor(Date.now() / 1000) - (maxDays * 24 * 60 * 60);
    const result = await this.db.prepare(`
      DELETE FROM users WHERE last_accessed < ?
    `).bind(cutoff).run();
    return result.meta.changes || 0;
  }

  /**
   * Encrypt password for URL usage
   * Uses a simple encoding for the Workers version
   */
  private async encryptPassword(password: string): Promise<string> {
    // For Workers, we use a simpler approach - encode with base64
    // The full encryption would require the SECRET_KEY from env
    return toUrlSafeBase64(password);
  }

  /**
   * Decrypt password from URL
   */
  static decryptPassword(encryptedPassword: string): string {
    return fromUrlSafeBase64(encryptedPassword);
  }
}
