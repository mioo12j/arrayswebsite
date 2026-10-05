import { ApiError } from '../utils/asyncHandler.js';

// Restricts a route to one or more roles. Example: requireRole('admin')
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }
    next();
  };
}

// 'editor' is a super-admin: every admin privilege, plus exclusive rights
// (data tools, managing protected users).
export const adminOnly = requireRole('admin', 'editor');
export const editorOnly = requireRole('editor');

// The admin is a VIEW-ONLY oversight account: it can see everything but cannot
// import, export/download, or write (create/edit/delete). The editor is the
// super-admin and the operator (System Manager) does the day-to-day data entry,
// uploads and downloads. These three guards enforce that.

// Block admin from import / upload / OCR endpoints.
export function noImportForAdmin(req, _res, next) {
  if (req.user?.role === 'admin') {
    return next(new ApiError(403, 'Importing & uploading is disabled for the admin (view-only) account. Data entry and imports are done by the System Manager.'));
  }
  next();
}

// Block admin from any export / download endpoint (reports, ledgers, files).
export function denyExportForAdmin(req, _res, next) {
  if (req.user?.role === 'admin') {
    return next(new ApiError(403, 'Exporting & downloading are disabled for the admin (view-only) account.'));
  }
  next();
}

// Make a whole router read-only for admin: any non-GET method is blocked.
// (Self-service password change lives on /auth, which this is not applied to.)
export function denyWriteForAdmin(req, _res, next) {
  if (req.user?.role === 'admin' && req.method !== 'GET') {
    return next(new ApiError(403, 'The admin account is view-only — creating, editing and deleting are disabled.'));
  }
  next();
}
