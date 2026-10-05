// Seeds default users, expense categories and a couple of demo records so the
// dashboard isn't empty on first run. Idempotent: safe to run multiple times.
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';

async function upsertUser(name, email, password, role, isProtected = false) {
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, is_protected)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, role=EXCLUDED.role, is_protected=EXCLUDED.is_protected`,
    [name, email, hash, role, isProtected]
  );
}

async function seedCategories() {
  const cats = [
    ['Steel', 'expense'],
    ['Solar Panels', 'expense'],
    ['Cables', 'expense'],
    ['Inverters', 'expense'],
    ['Mounting Structure', 'expense'],
    ['Transport', 'expense'],
    ['Labour', 'expense'],
    ['Civil Work', 'expense'],
    ['Electrical', 'expense'],
    ['Miscellaneous', 'expense'],
    ['Project Revenue', 'revenue'],
  ];
  for (const [name, kind] of cats) {
    await pool.query(
      `INSERT INTO expense_categories (name, kind) VALUES ($1,$2)
       ON CONFLICT (name) DO NOTHING`,
      [name, kind]
    );
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log('[seed] Seeding users ...');
  // Login IDs (stored in the email/identifier column).
  await upsertUser('Editor', 'editor', 'editor@123', 'editor', true); // super-admin, protected
  await upsertUser('System Admin', 'admin', 'admin@123', 'admin');
  await upsertUser('System Manager', 'operator', 'operator@123', 'operator');
  // Remove any older demo accounts so only the configured IDs remain.
  await pool.query(
    `DELETE FROM users WHERE email IN ('admin@ingenieria.com','operator@ingenieria.com','admin@solarepc.com','operator@solarepc.com')`
  );

  // eslint-disable-next-line no-console
  console.log('[seed] Seeding expense categories ...');
  await seedCategories();

  // eslint-disable-next-line no-console
  console.log('[seed] Done.');
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] Failed:', err.message);
  process.exit(1);
});
