import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_ROOT = path.resolve(__dirname, '../../', env.uploads.dir);

// §9 Local file storage — organized category folders.
export const UPLOAD_FOLDERS = ['vendor', 'invoices', 'challans', 'payments', 'statements', 'screenshots', 'documents'];
if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
for (const f of UPLOAD_FOLDERS) {
  const dir = path.join(UPLOAD_ROOT, f);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${base}-${unique}${ext.toLowerCase()}`);
  },
});

const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);

export const upload = multer({
  storage,
  limits: { fileSize: env.uploads.maxMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

// Dedicated uploader for backup archives — a full backup .zip can be large
// (data + all attachment files), so this allows big zips only.
export const uploadBackup = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 },   // up to 1 GB
  fileFilter: (_req, file, cb) => {
    const ok = /\.zip$/i.test(file.originalname) ||
      ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(file.mimetype);
    if (ok) return cb(null, true);
    cb(new Error('Please choose a CompanyBackup .zip file'));
  },
});
