import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { asyncHandler, ApiError } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { getDocument } from '../services/document.service.js';
import { readArchivedBuffer } from '../services/proofArchiver.js';
import { UPLOAD_ROOT } from '../middleware/upload.js';

const router = Router();
router.use(authenticate);

// Serve / download a stored document (auth-protected). Handles both loose files
// and ones that have been rolled into a monthly archive zip.
router.get(
  '/:id/file',
  asyncHandler(async (req, res) => {
    const doc = await getDocument(req.params.id);
    if (!doc) throw new ApiError(404, 'Document not found');
    const inline = req.query.inline === '1';
    const disposition = `${inline ? 'inline' : 'attachment'}; filename="${doc.original_name}"`;

    const filePath = path.join(UPLOAD_ROOT, doc.stored_name);
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', disposition);
      return fs.createReadStream(filePath).pipe(res);
    }
    // Archived into a monthly zip → serve the entry straight from it.
    const buf = readArchivedBuffer(doc);
    if (buf) {
      res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', disposition);
      return res.end(buf);
    }
    throw new ApiError(404, 'File missing from storage');
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const doc = await getDocument(req.params.id);
    if (!doc) throw new ApiError(404, 'Document not found');
    res.json(doc);
  })
);

export default router;
