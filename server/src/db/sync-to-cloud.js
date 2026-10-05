// Publish LOCAL data to the cloud (Neon). Run with:  npm run sync
//
//   PowerShell:
//     $env:CLOUD_DATABASE_URL="postgresql://...neon...sslmode=require"
//     npm run sync
//
// Copies table data only — uploaded files stay on this computer.
import pg from 'pg';
import { env } from '../config/env.js';
import { syncToCloud } from '../services/sync.service.js';

const { Pool } = pg;

// Source is ALWAYS the local database (never DATABASE_URL), so running this on a
// machine that also has DATABASE_URL set can't accidentally sync cloud->cloud.
const source = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  max: 4,
});

const targetUrl = process.env.CLOUD_DATABASE_URL;

async function main() {
  if (!targetUrl) {
    // eslint-disable-next-line no-console
    console.error('\n[sync] CLOUD_DATABASE_URL is not set.\n        Set it to your Neon connection string, e.g.\n        $env:CLOUD_DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"\n');
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log('[sync] Publishing local data to the cloud (files are NOT uploaded) ...');
  const counts = await syncToCloud(source, targetUrl);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  // eslint-disable-next-line no-console
  console.log('[sync] Done. Rows published per table:');
  for (const [t, n] of Object.entries(counts)) if (n) console.log(`        ${t.padEnd(26)} ${n}`);
  // eslint-disable-next-line no-console
  console.log(`[sync] Total ${total} rows. The admin can now see this data on the web.`);
  await source.end();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error('[sync] Failed:', err.message);
  try { await source.end(); } catch { /* ignore */ }
  process.exit(1);
});
