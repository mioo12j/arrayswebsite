import pg from 'pg';
import { env } from './env.js';

// Ensure numeric/decimal columns come back as JS numbers, not strings,
// so financial maths in the API works without manual parsing.
pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val))); // numeric
pg.types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10))); // bigint

const { Pool } = pg;

// Cloud Postgres (Neon/Supabase/Render) requires SSL and is usually provided as
// a single DATABASE_URL. Locally we use discrete PG* vars with no SSL.
const useUrl = !!env.db.url;
const isLocalUrl = useUrl && /@(localhost|127\.0\.0\.1)[:/]/.test(env.db.url);
// Cloud connections need SSL; localhost (incl. a localhost DATABASE_URL) must not.
const ssl = ((useUrl && !isLocalUrl) || env.db.ssl) ? { rejectUnauthorized: false } : false;

export const pool = new Pool(
  useUrl
    ? { connectionString: env.db.url, ssl, max: 10, idleTimeoutMillis: 30000 }
    : {
        host: env.db.host,
        port: env.db.port,
        database: env.db.database,
        user: env.db.user,
        password: env.db.password,
        ssl,
        max: 10,
        idleTimeoutMillis: 30000,
      }
);

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] Unexpected pool error:', err.message);
});

/** Run a parameterized query. */
export const query = (text, params) => pool.query(text, params);

/**
 * Run a set of statements inside a transaction.
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
