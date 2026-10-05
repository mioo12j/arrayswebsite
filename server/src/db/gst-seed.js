// Seeds GST master / reference data. Run with: npm run gst:seed
import { pool } from '../config/db.js';
import { seedMasterData } from '../services/gst/masterData.js';

async function run() {
  // eslint-disable-next-line no-console
  console.log('[gst-seed] seeding master data ...');
  const n = await seedMasterData(pool);
  // eslint-disable-next-line no-console
  console.log(`[gst-seed] upserted ${n} master rows.`);
  await pool.end();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[gst-seed] failed:', err.message);
  process.exit(1);
});
