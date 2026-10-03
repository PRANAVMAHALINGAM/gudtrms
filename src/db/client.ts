// Neon connection. Reads DATABASE_URL from .env (see .env.example).

import { Pool, types } from '@neondatabase/serverless';

// `date` columns (e.g. proposals.move_out_date) come back as 'YYYY-MM-DD' strings, matching
// IsoDate in src/shared/types.ts. The default turns them into a JS Date at local midnight,
// which can print as the wrong day.
types.setTypeParser(types.builtins.DATE!, (value) => value);

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
    pool = new Pool({ connectionString });
  }
  return pool;
}

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
