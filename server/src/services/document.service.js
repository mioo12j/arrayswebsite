import path from 'node:path';
import { query } from '../config/db.js';
import { extractText } from './ocr.service.js';

/**
 * Persists an uploaded file as a `documents` row, optionally running OCR.
 * @returns the created document row.
 */
export async function saveDocument({
  file,
  kind,
  entity = null,
  entityId = null,
  userId = null,
  runOcr = false,
}) {
  let ocrText = null;
  let ocrJson = null;
  if (runOcr) {
    ocrText = await extractText(file.path, file.mimetype);
  }

  const { rows } = await query(
    `INSERT INTO documents
       (kind, entity, entity_id, original_name, stored_name, mime_type,
        size_bytes, storage_path, ocr_text, ocr_json, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      kind,
      entity,
      entityId,
      file.originalname,
      file.filename,
      file.mimetype,
      file.size,
      path.relative(process.cwd(), file.path),
      ocrText,
      ocrJson ? JSON.stringify(ocrJson) : null,
      userId,
    ]
  );
  return rows[0];
}

export async function getDocument(id) {
  const { rows } = await query('SELECT * FROM documents WHERE id=$1', [id]);
  return rows[0] || null;
}
