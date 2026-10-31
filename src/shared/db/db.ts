export interface DbResult<T> {
  rows: T[];
  rowCount: number;
}

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<DbResult<T>>;
  exec(sql: string): Promise<void>;
  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

import { Pool } from 'pg';
import type { PGlite, Transaction } from '@electric-sql/pglite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

class PgDb implements Db {
  constructor(private readonly pool: Pool) {}

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<DbResult<T>> {
    const result = await this.pool.query(sql, params as unknown[]);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx: Db = {
        query: async <R>(sql: string, params: readonly unknown[] = []) => {
          const result = await client.query(sql, params as unknown[]);
          return { rows: result.rows as R[], rowCount: result.rowCount ?? 0 };
        },
        exec: async (statement: string) => {
          await client.query(statement);
        },
        transaction: async <R>(_nested: (inner: Db) => Promise<R>) => {
          throw new Error('Nested transactions are not supported');
        },
        close: async () => undefined,
      };
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class PgliteDb implements Db {
  constructor(private readonly database: PGlite) {}

  static async create(dataDir?: string): Promise<PgliteDb> {
    const { PGlite } = await import('@electric-sql/pglite');
    const database = dataDir ? new PGlite(dataDir) : new PGlite();
    await database.waitReady;
    return new PgliteDb(database);
  }

  async query<T>(sql: string, params: readonly unknown[] = []): Promise<DbResult<T>> {
    const result = await this.database.query<T>(sql, params as unknown[]);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  }

  async exec(sql: string): Promise<void> {
    await this.database.exec(sql);
  }

  async transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.database.transaction(async (tx: Transaction) => {
      const wrapped: Db = {
        query: async <R>(sql: string, params: readonly unknown[] = []) => {
          const result = await tx.query<R>(sql, params as unknown[]);
          return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
        },
        exec: async (statement: string) => {
          await tx.exec(statement);
        },
        transaction: async <R>(_nested: (inner: Db) => Promise<R>) => {
          throw new Error('Nested transactions are not supported');
        },
        close: async () => undefined,
      };
      return work(wrapped);
    });
  }

  async close(): Promise<void> {
    await this.database.close();
  }
}

export async function createDb(databaseUrl: string): Promise<Db> {
  if (databaseUrl.startsWith('pglite:')) {
    const target = databaseUrl.slice('pglite://'.length);
    if (target !== '' && target !== 'memory') {
      await mkdir(dirname(resolve(target)), { recursive: true });
    }
    return PgliteDb.create(target === '' || target === 'memory' ? undefined : target);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return new PgDb(pool);
}
