import { ApiError } from '../utils/asyncHandler.js';

export function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Centralised error handler.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  // Postgres unique violation
  if (err.code === '23505') {
    return res.status(409).json({ error: 'A record with these details already exists' });
  }
  // Postgres FK violation
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record does not exist' });
  }
  // Invalid value for the column type — e.g. a non-UUID id in the URL, or a bad
  // enum value. Return a clean 4xx instead of a 500 with a leaked SQL message.
  if (err.code === '22P02' || err.code === '22007' || err.code === '22008') {
    return res.status(400).json({ error: 'Invalid value in the request (bad id, date or option).' });
  }
  // Not-null violation — a required field was missing.
  if (err.code === '23502') {
    return res.status(400).json({ error: 'A required field is missing.' });
  }
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  // Internal ERP — surface the message (not the stack) to aid debugging.
  res.status(500).json({ error: 'Internal server error', detail: err.message });
}
