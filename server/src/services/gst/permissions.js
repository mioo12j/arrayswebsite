// ============================================================================
//  GST RBAC + maker-checker
//
//  Granular permissions mapped to roles. Maker (operator) prepares/validates;
//  Checker (admin) submits to the portal, cancels, and approves. The editor is
//  the super-user. Submission and cancellation are deliberately NOT granted to
//  the maker — "a user who can prepare an invoice should not automatically be
//  allowed to submit it to the government portals".
// ============================================================================

import { ApiError } from '../../utils/asyncHandler.js';

export const PERMS = {
  VIEW: 'gst.view',
  CREATE: 'gst.create',
  EDIT: 'gst.edit',
  VALIDATE: 'gst.validate',
  SUBMIT: 'gst.submit',     // generate IRN / generate EWB (checker)
  CANCEL: 'gst.cancel',     // checker
  APPROVE: 'gst.approve',   // maker-checker sign-off (checker)
  PRINT: 'gst.print',
  DOWNLOAD: 'gst.download',
  EXPORT: 'gst.export',
  ARCHIVE: 'gst.archive',
  ADMIN: 'gst.admin',
};

const MAKER = [
  PERMS.VIEW, PERMS.CREATE, PERMS.EDIT, PERMS.VALIDATE,
  PERMS.PRINT, PERMS.DOWNLOAD, PERMS.EXPORT, PERMS.ARCHIVE,
];
const CHECKER = [...MAKER, PERMS.SUBMIT, PERMS.CANCEL, PERMS.APPROVE, PERMS.ADMIN];
const ALL = Object.values(PERMS);

// Read-only auditor: view, download PDFs/JSON, export reports — nothing else.
const AUDITOR = [PERMS.VIEW, PERMS.DOWNLOAD, PERMS.EXPORT];

export const ROLE_PERMS = {
  // System Manager (operator) performs every action directly — create, edit,
  // delete, generate challans/invoices/e-way bills, import and export — with no
  // approval gate.
  operator: ALL,
  // Admin is a strict VIEW-ONLY oversight account: it can see everything but
  // cannot create, edit, submit, cancel, download, export, archive or import.
  admin: [PERMS.VIEW],
  editor: ALL,                // super-user — everything
  auditor: AUDITOR,           // read-only review (may still export for audit)
};

export function permsForRole(role) {
  return ROLE_PERMS[role] || [];
}

export function hasPermission(role, perm) {
  return permsForRole(role).includes(perm);
}

// Express middleware factory.
export function requirePerm(perm) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (!hasPermission(req.user.role, perm)) {
      return next(new ApiError(403, `You do not have the “${perm}” permission. This action is reserved for the checker/approver role.`));
    }
    next();
  };
}

// Maker-checker separation. OFF by default for the single-operator model — set
// GST_MAKER_CHECKER=on only if a separate checker/approver is reintroduced.
export function makerCheckerEnabled() {
  return String(process.env.GST_MAKER_CHECKER || 'off').toLowerCase() === 'on';
}
