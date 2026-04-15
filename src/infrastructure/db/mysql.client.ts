import fs from 'fs/promises';
import path from 'path';
import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import { env } from '../../config/env';
import { logger } from '../logger';

const MIGRATIONS_DIRECTORY = path.resolve(process.cwd(), 'db/migrations');

type SchemaMigrationRow = RowDataPacket & {
  id: string;
};

let poolPromise: Promise<Pool> | null = null;

const escapeIdentifier = (value: string): string => `\`${value.replace(/`/g, '``')}\``;

const baseConnectionOptions = {
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  multipleStatements: true,
  decimalNumbers: true,
  timezone: 'Z'
} as const;

const createDatabaseIfMissing = async (): Promise<void> => {
  const connection = await mysql.createConnection(baseConnectionOptions);

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(env.mysql.databaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await connection.end();
  }
};

const ensureMigrationTable = async (pool: Pool): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(255) PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const runMigrations = async (pool: Pool): Promise<void> => {
  await ensureMigrationTable(pool);

  const migrationFiles = (await fs.readdir(MIGRATIONS_DIRECTORY))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  for (const migrationFile of migrationFiles) {
    const [existing] = await pool.execute<SchemaMigrationRow[]>('SELECT id FROM schema_migrations WHERE id = ? LIMIT 1', [migrationFile]);
    if (existing.length > 0) {
      continue;
    }

    const migrationPath = path.join(MIGRATIONS_DIRECTORY, migrationFile);
    const sql = (await fs.readFile(migrationPath, 'utf8')).trim();
    if (!sql) {
      await pool.execute('INSERT INTO schema_migrations (id) VALUES (?)', [migrationFile]);
      continue;
    }

    logger.info('Applying MySQL migration', { migration: migrationFile, database: env.mysql.databaseName });
    await pool.query(sql);
    await pool.execute('INSERT INTO schema_migrations (id) VALUES (?)', [migrationFile]);
  }
};

const initializePool = async (): Promise<Pool> => {
  await createDatabaseIfMissing();

  const pool = mysql.createPool({
    ...baseConnectionOptions,
    database: env.mysql.databaseName,
    connectionLimit: env.mysql.connectionLimit,
    waitForConnections: true,
    queueLimit: 0
  });

  await runMigrations(pool);

  logger.info('MySQL persistence ready', {
    host: env.mysql.host,
    port: env.mysql.port,
    database: env.mysql.databaseName
  });

  return pool;
};

export const initializeMySqlPersistence = async (): Promise<void> => {
  await getMySqlPool();
};

export const getMySqlPool = async (): Promise<Pool> => {
  if (!poolPromise) {
    poolPromise = initializePool().catch((error: unknown) => {
      poolPromise = null;
      logger.error('MySQL initialization failed', {
        message: error instanceof Error ? error.message : 'Unknown MySQL initialization error'
      });
      throw error;
    });
  }

  return poolPromise;
};