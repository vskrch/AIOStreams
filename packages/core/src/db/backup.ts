import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/index.js';
import { parseConnectionURI } from './utils.js';

const logger = createLogger('backup');

interface BackupConfig {
  enabled: boolean;
  endpoint?: string;
  bucket?: string;
  accessKey?: string;
  secretKey?: string;
  region?: string;
  databaseUri: string;
}

let s3Client: S3Client | null = null;
let backupConfig: BackupConfig | null = null;

/**
 * Initialize the backup system with configuration from environment variables
 */
export function initializeBackup(config: BackupConfig): void {
  backupConfig = config;

  if (!config.enabled) {
    logger.info('SQLite backup is disabled');
    return;
  }

  if (!config.endpoint || !config.bucket || !config.accessKey || !config.secretKey) {
    logger.warn(
      'SQLite backup is enabled but missing required configuration (endpoint, bucket, accessKey, secretKey)'
    );
    backupConfig.enabled = false;
    return;
  }

  // Only enable backup for SQLite databases
  if (!config.databaseUri.includes('sqlite')) {
    logger.info('SQLite backup only works with SQLite databases, skipping');
    backupConfig.enabled = false;
    return;
  }

  s3Client = new S3Client({
    endpoint: config.endpoint,
    region: config.region || 'auto',
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: true, // Required for some S3-compatible services
  });

  logger.info('SQLite backup initialized', {
    endpoint: config.endpoint,
    bucket: config.bucket,
  });
}

/**
 * Get the SQLite database file path from the DATABASE_URI
 */
function getDatabasePath(databaseUri: string): string {
  const parsed = parseConnectionURI(databaseUri);
  if (parsed.dialect !== 'sqlite') {
    throw new Error('Backup only supports SQLite databases');
  }
  return parsed.filename;
}

/**
 * Get the backup key (filename) in S3
 */
function getBackupKey(): string {
  return 'aiostreams-db.sqlite';
}

/**
 * Restore the database from S3 backup before the app starts
 * Should be called before database initialization
 */
export async function restoreDatabase(): Promise<boolean> {
  if (!backupConfig?.enabled || !s3Client) {
    return false;
  }

  const dbPath = getDatabasePath(backupConfig.databaseUri);
  const backupKey = getBackupKey();

  try {
    // Check if backup exists
    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: backupConfig.bucket,
          Key: backupKey,
        })
      );
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        logger.info('No backup found in S3, starting with fresh database');
        return false;
      }
      throw error;
    }

    // Download backup
    logger.info('Downloading database backup from S3...', { key: backupKey });
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: backupConfig.bucket,
        Key: backupKey,
      })
    );

    if (!response.Body) {
      logger.warn('Backup file is empty');
      return false;
    }

    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Write to file
    const bodyBytes = await response.Body.transformToByteArray();
    fs.writeFileSync(dbPath, Buffer.from(bodyBytes));

    logger.info('Database restored from backup successfully', {
      size: bodyBytes.length,
      path: dbPath,
    });

    return true;
  } catch (error) {
    logger.error('Failed to restore database from backup:', error);
    return false;
  }
}

/**
 * Backup the database to S3
 * Should be called during graceful shutdown
 */
export async function backupDatabase(): Promise<boolean> {
  if (!backupConfig?.enabled || !s3Client) {
    return false;
  }

  const dbPath = getDatabasePath(backupConfig.databaseUri);
  const backupKey = getBackupKey();

  try {
    // Check if database file exists
    if (!fs.existsSync(dbPath)) {
      logger.warn('Database file does not exist, skipping backup', { path: dbPath });
      return false;
    }

    // Read database file
    const dbData = fs.readFileSync(dbPath);

    logger.info('Uploading database backup to S3...', {
      key: backupKey,
      size: dbData.length,
    });

    // Upload to S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: backupConfig.bucket,
        Key: backupKey,
        Body: dbData,
        ContentType: 'application/x-sqlite3',
      })
    );

    logger.info('Database backup completed successfully');
    return true;
  } catch (error) {
    logger.error('Failed to backup database to S3:', error);
    return false;
  }
}

/**
 * Check if backup is enabled and properly configured
 */
export function isBackupEnabled(): boolean {
  return backupConfig?.enabled ?? false;
}
