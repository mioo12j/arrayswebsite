-- ============================================================================
--  GST COMPLIANCE MODULE — schema
--  e-Invoice (IRP / IRN) and e-Way Bill are SEPARATE compliance objects.
--  Applied after schema.sql by migrate.js. Safe to re-run (idempotent).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Status enums (UI-critical, so enforced as enums) ───────────────────────
DO $$ BEGIN
  CREATE TYPE gst_einv_status AS ENUM (
    'draft','validated','pending_submission','submitted',
    'irn_generated','printed','cancelled','archived','error','needs_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE gst_ewb_status AS ENUM (
    'draft','validated','part_a','generated','printed',
    'cancelled','rejected','expired','closed','error','needs_review'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
--  MASTER / REFERENCE DATA  (portal-controlled enums; sync-able, never hard-coded)
-- ============================================================================
CREATE TABLE IF NOT EXISTS gst_master_data (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL,                 -- state_code | uqc | supply_type | ...
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  meta        JSONB NOT NULL DEFAULT '{}',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, code)
);
CREATE INDEX IF NOT EXISTS idx_gst_master_category ON gst_master_data(category);

-- ============================================================================
--  e-INVOICE  (registered through the IRP, returns IRN + signed QR)
-- ============================================================================
CREATE TABLE IF NOT EXISTS gst_einvoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env             TEXT NOT NULL DEFAULT 'sandbox',     -- sandbox | production
  schema_version  TEXT NOT NULL DEFAULT '1.1',
  status          gst_einv_status NOT NULL DEFAULT 'draft',

  -- Transaction-level (TranDtls) + document identity (DocDtls)
  supply_type     TEXT,                                -- B2B,SEZWP,SEZWOP,EXPWP,EXPWOP,DEXP,B2C
  doc_type        TEXT,                                -- INV,CRN,DBN
  doc_no          TEXT,
  doc_date        DATE,
  reverse_charge  BOOLEAN NOT NULL DEFAULT FALSE,
  igst_on_intra   BOOLEAN NOT NULL DEFAULT FALSE,
  ecom_gstin      TEXT,

  -- Schema blocks stored as JSONB so new notified fields never need a migration.
  tran_dtls       JSONB NOT NULL DEFAULT '{}',
  doc_dtls        JSONB NOT NULL DEFAULT '{}',
  seller_dtls     JSONB NOT NULL DEFAULT '{}',
  buyer_dtls      JSONB NOT NULL DEFAULT '{}',
  disp_dtls       JSONB,
  ship_dtls       JSONB,
  item_list       JSONB NOT NULL DEFAULT '[]',
  val_dtls        JSONB NOT NULL DEFAULT '{}',
  pay_dtls        JSONB,
  ref_dtls        JSONB,
  addl_doc_dtls   JSONB,
  exp_dtls        JSONB,
  ewb_dtls        JSONB,                               -- optional EWB block inside e-invoice

  -- Searchable / indexed scalars (denormalised from the blocks)
  buyer_gstin     TEXT,
  buyer_name      TEXT,
  total_inv_val   NUMERIC(14,2),
  total_tax_val   NUMERIC(14,2),

  -- Canonical payload sent to the IRP + the signed response (source of truth)
  canonical_payload JSONB,
  irn             TEXT,
  ack_no          TEXT,
  ack_date        TIMESTAMPTZ,
  signed_invoice  TEXT,
  signed_qr       TEXT,
  irp_status      TEXT,                                -- ACT (active) | CNL (cancelled)

  -- Lawful cancellation (cannot "reinstate" a govt-cancelled IRN)
  is_cancelled    BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_reason_code TEXT,
  cancel_remark   TEXT,
  cancel_date     TIMESTAMPTZ,
  cancelled_by    UUID REFERENCES users(id),

  -- Print / archive
  print_count     INT NOT NULL DEFAULT 0,
  last_printed_at TIMESTAMPTZ,
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,

  -- Maker-checker
  prepared_by     UUID REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  submitted_by    UUID REFERENCES users(id),
  submitted_at    TIMESTAMPTZ,

  -- Validation snapshot
  validation_errors JSONB NOT NULL DEFAULT '[]',
  last_error      TEXT,

  -- Buyer purchase-order reference + delivery/site address — printed on our
  -- branded PDF only, NOT sent to the IRP/portal JSON.
  po_no           TEXT,
  po_date         DATE,
  site_address    TEXT,

  -- Cross-linking + safety
  source_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  credit_note_source_einvoice_id UUID REFERENCES gst_einvoices(id), -- a CRN's original tax invoice (this table)
  idempotency_key TEXT UNIQUE,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_einv_status    ON gst_einvoices(status);
CREATE INDEX IF NOT EXISTS idx_einv_docno     ON gst_einvoices(doc_no);
CREATE INDEX IF NOT EXISTS idx_einv_buyer     ON gst_einvoices(buyer_gstin);
CREATE INDEX IF NOT EXISTS idx_einv_irn       ON gst_einvoices(irn);
CREATE INDEX IF NOT EXISTS idx_einv_created   ON gst_einvoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_einv_srcinv    ON gst_einvoices(source_invoice_id);

DROP TRIGGER IF EXISTS trg_einv_updated ON gst_einvoices;
CREATE TRIGGER trg_einv_updated BEFORE UPDATE ON gst_einvoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
--  e-WAY BILL  (separate REST service; returns EWB no + validity)
-- ============================================================================
CREATE TABLE IF NOT EXISTS gst_eway_bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  env             TEXT NOT NULL DEFAULT 'sandbox',
  status          gst_ewb_status NOT NULL DEFAULT 'draft',

  -- Supply / document
  supply_type       TEXT,                              -- O (outward) | I (inward)
  sub_supply_type   TEXT,                              -- 1..12 (master)
  sub_supply_desc   TEXT,
  doc_type          TEXT,                              -- INV,BIL,BOE,CHL,CNT,OTH
  doc_no            TEXT,
  doc_date          DATE,
  transaction_type  INT,                               -- 1 Regular,2 BillTo-ShipTo,3 BillFrom-DispatchFrom,4 Combination

  -- From / To parties
  from_gstin        TEXT,
  from_trade_name   TEXT,
  from_pincode      INT,
  from_state_code   INT,
  dispatch_from_gstin TEXT,
  act_from_state_code INT,
  to_gstin          TEXT,
  to_trade_name     TEXT,
  to_pincode        INT,
  to_state_code     INT,
  ship_to_gstin     TEXT,                              -- mandatory for Bill-To Ship-To (22/05/2026)
  act_to_state_code INT,

  -- Values
  tot_inv_value     NUMERIC(14,2),
  tot_taxable_val   NUMERIC(14,2),
  cgst_value        NUMERIC(14,2),
  sgst_value        NUMERIC(14,2),
  igst_value        NUMERIC(14,2),
  cess_value        NUMERIC(14,2),
  other_value       NUMERIC(14,2),
  trans_distance    INT,

  -- Transport (Part B)
  transporter_id    TEXT,
  transporter_name  TEXT,
  trans_mode        TEXT,                              -- 1 Road,2 Rail,3 Air,4 Ship
  trans_doc_no      TEXT,
  trans_doc_date    DATE,
  vehicle_no        TEXT,
  vehicle_type      TEXT,                              -- R Regular, O ODC

  item_list         JSONB NOT NULL DEFAULT '[]',

  -- Part A / Part B readiness
  part_a_ready      BOOLEAN NOT NULL DEFAULT FALSE,
  part_b_ready      BOOLEAN NOT NULL DEFAULT FALSE,

  -- Canonical payload + portal response
  canonical_payload JSONB,
  ewb_no            TEXT,
  ewb_date          TIMESTAMPTZ,
  valid_upto        TIMESTAMPTZ,
  ewb_status_portal TEXT,

  -- Cancellation / rejection / closure / extension
  is_cancelled      BOOLEAN NOT NULL DEFAULT FALSE,
  cancel_reason_code TEXT,
  cancel_remark     TEXT,
  cancel_date       TIMESTAMPTZ,
  cancelled_by      UUID REFERENCES users(id),
  is_rejected       BOOLEAN NOT NULL DEFAULT FALSE,
  is_closed         BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at         TIMESTAMPTZ,
  closed_by         UUID REFERENCES users(id),
  extended_count    INT NOT NULL DEFAULT 0,

  -- Print / archive
  print_count       INT NOT NULL DEFAULT 0,
  last_printed_at   TIMESTAMPTZ,
  is_archived       BOOLEAN NOT NULL DEFAULT FALSE,

  -- Maker-checker
  prepared_by       UUID REFERENCES users(id),
  approved_by       UUID REFERENCES users(id),
  generated_by      UUID REFERENCES users(id),
  generated_at      TIMESTAMPTZ,

  -- Validation snapshot
  validation_errors JSONB NOT NULL DEFAULT '[]',
  last_error        TEXT,

  -- Cross-linking + safety
  source_einvoice_id UUID REFERENCES gst_einvoices(id) ON DELETE SET NULL,
  source_invoice_id  UUID REFERENCES invoices(id) ON DELETE SET NULL,
  idempotency_key   TEXT UNIQUE,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ewb_status   ON gst_eway_bills(status);
CREATE INDEX IF NOT EXISTS idx_ewb_no       ON gst_eway_bills(ewb_no);
CREATE INDEX IF NOT EXISTS idx_ewb_docno    ON gst_eway_bills(doc_no);
CREATE INDEX IF NOT EXISTS idx_ewb_valid    ON gst_eway_bills(valid_upto);
CREATE INDEX IF NOT EXISTS idx_ewb_created  ON gst_eway_bills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ewb_srceinv  ON gst_eway_bills(source_einvoice_id);

DROP TRIGGER IF EXISTS trg_ewb_updated ON gst_eway_bills;
CREATE TRIGGER trg_ewb_updated BEFORE UPDATE ON gst_eway_bills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
--  IMMUTABLE API LOG  (every request/response retained; append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS gst_api_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type     TEXT NOT NULL,                       -- einvoice | ewb
  object_id       UUID,
  env             TEXT,
  action          TEXT NOT NULL,                       -- generate | cancel | update_partb | extend | close | reject | auth
  request_payload JSONB,
  request_hash    TEXT,
  response_payload JSONB,
  response_status TEXT,                                -- sent | accepted | rejected | unknown
  http_status     INT,
  error_code      TEXT,
  error_message   TEXT,
  idempotency_key TEXT,
  duration_ms     INT,
  user_id         UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gstlog_object ON gst_api_logs(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_gstlog_created ON gst_api_logs(created_at DESC);

-- Block UPDATE/DELETE so the API log is truly immutable (legal recordkeeping).
CREATE OR REPLACE FUNCTION gst_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'gst_api_logs is append-only and cannot be modified or deleted';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_gstlog_immutable ON gst_api_logs;
CREATE TRIGGER trg_gstlog_immutable BEFORE UPDATE OR DELETE ON gst_api_logs
  FOR EACH ROW EXECUTE FUNCTION gst_block_mutation();

-- ============================================================================
--  AUDIT TIMELINE  (old/new value per event; append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS gst_audit_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL,                           -- einvoice | ewb
  object_id   UUID NOT NULL,
  event_type  TEXT NOT NULL,                           -- created|edited|validated|submitted|irn_generated|printed|cancelled|rejected|part_b_updated|closed|approved|error
  field       TEXT,
  old_value   TEXT,
  new_value   TEXT,
  message     TEXT,
  user_id     UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gstaudit_object ON gst_audit_events(object_type, object_id, created_at);

DROP TRIGGER IF EXISTS trg_gstaudit_immutable ON gst_audit_events;
CREATE TRIGGER trg_gstaudit_immutable BEFORE UPDATE OR DELETE ON gst_audit_events
  FOR EACH ROW EXECUTE FUNCTION gst_block_mutation();

-- ============================================================================
--  Phase 2 additions — soft delete + security/access log
-- ============================================================================
ALTER TABLE gst_einvoices  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gst_einvoices  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE gst_einvoices  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);
ALTER TABLE gst_eway_bills ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gst_eway_bills ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE gst_eway_bills ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- Address / place lines for the EWB From & To blocks (used by the PDF).
ALTER TABLE gst_eway_bills ADD COLUMN IF NOT EXISTS from_addr1 TEXT;
ALTER TABLE gst_eway_bills ADD COLUMN IF NOT EXISTS from_addr2 TEXT;
ALTER TABLE gst_eway_bills ADD COLUMN IF NOT EXISTS from_place TEXT;
ALTER TABLE gst_eway_bills ADD COLUMN IF NOT EXISTS to_addr1 TEXT;
ALTER TABLE gst_eway_bills ADD COLUMN IF NOT EXISTS to_addr2 TEXT;
ALTER TABLE gst_eway_bills ADD COLUMN IF NOT EXISTS to_place TEXT;

-- Session / IP / download / export access trail (security recordkeeping).
CREATE TABLE IF NOT EXISTS gst_access_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  session_id  TEXT,
  ip          TEXT,
  user_agent  TEXT,
  action      TEXT NOT NULL,             -- view | download | export | print | email | bulk
  object_type TEXT,
  object_id   UUID,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gst_access_created ON gst_access_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gst_access_user ON gst_access_logs(user_id);

-- ============================================================================
--  Phase A — Reconciliation resolutions + Notification center
-- ============================================================================

-- Resolution state for a computed discrepancy (the discrepancies themselves are
-- derived live; only their resolution/override status is persisted here).
CREATE TABLE IF NOT EXISTS gst_recon_resolutions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_key   TEXT NOT NULL,                 -- e.g. draft_not_submitted
  object_type TEXT NOT NULL,                 -- einvoice | ewb | invoice
  object_id   UUID NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',  -- open | resolved | overridden | ignored
  note        TEXT,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (check_key, object_type, object_id)
);
CREATE INDEX IF NOT EXISTS idx_recon_status ON gst_recon_resolutions(status);

-- In-app notifications / alerts. dedupe_key keeps the engine idempotent so a
-- repeated refresh updates the same alert instead of duplicating it.
CREATE TABLE IF NOT EXISTS gst_notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key       TEXT UNIQUE NOT NULL,
  severity         TEXT NOT NULL DEFAULT 'info',   -- info | warning | critical
  type             TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  object_type      TEXT,
  object_id        UUID,
  suggested_action TEXT,
  status           TEXT NOT NULL DEFAULT 'unread', -- unread | read | acknowledged | resolved
  acknowledged_by  UUID REFERENCES users(id),
  acknowledged_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_status ON gst_notifications(status);
CREATE INDEX IF NOT EXISTS idx_notif_severity ON gst_notifications(severity);
CREATE INDEX IF NOT EXISTS idx_notif_created ON gst_notifications(created_at DESC);

-- ============================================================================
--  Phase B — Multi-branch / multi-GSTIN + invoice number series
-- ============================================================================
CREATE TABLE IF NOT EXISTS gst_branches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,           -- e.g. BR01, HO
  name            TEXT NOT NULL,
  gstin           TEXT,
  legal_name      TEXT,
  trade_name      TEXT,
  addr1           TEXT,
  addr2           TEXT,
  place           TEXT,
  pincode         TEXT,
  state_code      TEXT,
  phone           TEXT,
  email           TEXT,
  api_credentials JSONB,                          -- GSTIN-specific live creds (used only in live mode)
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_branch_updated ON gst_branches;
CREATE TRIGGER trg_branch_updated BEFORE UPDATE ON gst_branches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS gst_number_series (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID REFERENCES gst_branches(id) ON DELETE CASCADE,
  doc_type      TEXT NOT NULL DEFAULT 'INV',      -- INV | CRN | DBN | EWB
  name          TEXT,
  prefix        TEXT NOT NULL DEFAULT '{FY}/',    -- template: {BRANCH}{FY}{DOCTYPE}{SEQ}
  padding       INT NOT NULL DEFAULT 6,
  next_number   INT NOT NULL DEFAULT 1,
  fy_reset      BOOLEAN NOT NULL DEFAULT TRUE,
  current_fy    TEXT,
  is_locked     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_series_branch ON gst_number_series(branch_id, doc_type);

DROP TRIGGER IF EXISTS trg_series_updated ON gst_number_series;
CREATE TRIGGER trg_series_updated BEFORE UPDATE ON gst_number_series
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Branch dimension on the two compliance objects.
ALTER TABLE gst_einvoices  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES gst_branches(id);
ALTER TABLE gst_eway_bills ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES gst_branches(id);
CREATE INDEX IF NOT EXISTS idx_einv_branch ON gst_einvoices(branch_id);
CREATE INDEX IF NOT EXISTS idx_ewb_branch ON gst_eway_bills(branch_id);

-- ============================================================================
--  Phase C/D — attachments, GSTIN validation, OTP, schedules, backups, imports
-- ============================================================================

-- #3 Document attachments (compliance documentary trail).
CREATE TABLE IF NOT EXISTS gst_attachments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type    TEXT NOT NULL,                 -- einvoice | ewb | client | recon | branch
  object_id      UUID NOT NULL,
  category       TEXT,                           -- PO | challan | LR | POD | approval | signed | correspondence | audit | other
  original_name  TEXT NOT NULL,
  stored_name    TEXT NOT NULL,
  mime           TEXT,
  size_bytes     BIGINT,
  is_immutable   BOOLEAN NOT NULL DEFAULT FALSE, -- compliance-critical: cannot be deleted
  download_count INT NOT NULL DEFAULT 0,
  uploaded_by    UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gst_attach_obj ON gst_attachments(object_type, object_id);

-- #10 GSTIN validation results.
CREATE TABLE IF NOT EXISTS gst_gstin_validations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gstin         TEXT NOT NULL,
  client_id     UUID REFERENCES clients(id) ON DELETE SET NULL,
  format_ok     BOOLEAN,
  checksum_ok   BOOLEAN,
  state_code    TEXT,
  state_name    TEXT,
  pincode_match BOOLEAN,
  legal_name    TEXT,
  status        TEXT,                            -- Active | Inactive | Unknown
  source        TEXT NOT NULL DEFAULT 'local',   -- local | portal
  result        TEXT NOT NULL,                   -- valid | invalid | warning
  note          TEXT,
  override_reason TEXT,
  validated_by  UUID REFERENCES users(id),
  validated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gstinval_gstin ON gst_gstin_validations(gstin);

-- #15 OTP / 2FA challenges for critical actions.
CREATE TABLE IF NOT EXISTS gst_otp_challenges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id),
  action       TEXT NOT NULL,                    -- cancel_einvoice | cancel_ewb | mode_switch | ...
  object_type  TEXT,
  object_id    UUID,
  reason       TEXT,
  code_hash    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | verified | expired | used
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  verified_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_otp_user ON gst_otp_challenges(user_id, status);

-- #13 Scheduled reports.
CREATE TABLE IF NOT EXISTS gst_scheduled_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type  TEXT NOT NULL,
  frequency    TEXT NOT NULL DEFAULT 'monthly',  -- daily | weekly | monthly
  format       TEXT NOT NULL DEFAULT 'xlsx',
  branch_id    UUID REFERENCES gst_branches(id) ON DELETE SET NULL,
  recipients   JSONB,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at  TIMESTAMPTZ,
  next_run_at  TIMESTAMPTZ,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gst_report_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id  UUID REFERENCES gst_scheduled_reports(id) ON DELETE CASCADE,
  report_type  TEXT NOT NULL,
  row_count    INT,
  status       TEXT NOT NULL DEFAULT 'success',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reportrun_sched ON gst_report_runs(schedule_id, generated_at DESC);

-- #7 Backups / disaster recovery.
CREATE TABLE IF NOT EXISTS gst_backups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind           TEXT NOT NULL DEFAULT 'manual',  -- manual | daily | weekly | monthly
  status         TEXT NOT NULL DEFAULT 'success', -- success | failed
  destination    TEXT,
  file_path      TEXT,
  size_bytes     BIGINT,
  record_counts  JSONB,
  verified_at    TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_backup_started ON gst_backups(started_at DESC);

-- #1 enhanced security verification — extra columns on the challenge.
ALTER TABLE gst_otp_challenges ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
ALTER TABLE gst_otp_challenges ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'email';
ALTER TABLE gst_otp_challenges ADD COLUMN IF NOT EXISTS device TEXT;
ALTER TABLE gst_otp_challenges ADD COLUMN IF NOT EXISTS password_ok BOOLEAN DEFAULT FALSE;

-- #10 full-system backup — extra metadata columns.
ALTER TABLE gst_backups ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'full';
ALTER TABLE gst_backups ADD COLUMN IF NOT EXISTS file_count INT;
ALTER TABLE gst_backups ADD COLUMN IF NOT EXISTS duration_ms INT;
ALTER TABLE gst_backups ADD COLUMN IF NOT EXISTS checksum TEXT;
ALTER TABLE gst_backups ADD COLUMN IF NOT EXISTS verification JSONB;
ALTER TABLE gst_backups ADD COLUMN IF NOT EXISTS health INT;

-- #9 / #11 — general application configuration (maintenance mode, branding, etc.)
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
--  Governance & Usability — version control, comments, saved views, branding
-- ============================================================================

-- #2 Document version history (append-only / immutable).
CREATE TABLE IF NOT EXISTS gst_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type    TEXT NOT NULL,                 -- einvoice | ewb
  object_id      UUID NOT NULL,
  version_no     INT NOT NULL,
  snapshot       JSONB NOT NULL,
  change_summary TEXT,
  change_reason  TEXT,
  changed_fields JSONB NOT NULL DEFAULT '[]',
  prev_values    JSONB,
  new_values     JSONB,
  status_at      TEXT,
  user_id        UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (object_type, object_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_versions_obj ON gst_versions(object_type, object_id, version_no);
DROP TRIGGER IF EXISTS trg_versions_immutable ON gst_versions;
CREATE TRIGGER trg_versions_immutable BEFORE UPDATE OR DELETE ON gst_versions
  FOR EACH ROW EXECUTE FUNCTION gst_block_mutation();

-- #3 Discussion / collaboration threads.
CREATE TABLE IF NOT EXISTS gst_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type TEXT NOT NULL,
  object_id   UUID NOT NULL,
  parent_id   UUID REFERENCES gst_comments(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'internal', -- internal | approval | audit | system
  author_id   UUID REFERENCES users(id),
  content     TEXT NOT NULL,
  mentions    JSONB NOT NULL DEFAULT '[]',
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  is_pinned   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_obj ON gst_comments(object_type, object_id, created_at);

CREATE TABLE IF NOT EXISTS gst_comment_reads (
  object_type  TEXT NOT NULL,
  object_id    UUID NOT NULL,
  user_id      UUID NOT NULL REFERENCES users(id),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (object_type, object_id, user_id)
);

-- #5 Saved views / personal & shared workspaces.
CREATE TABLE IF NOT EXISTS gst_saved_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  name        TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT 'private',  -- private | team | company
  object_type TEXT NOT NULL DEFAULT 'einvoice', -- einvoice | ewb | search
  filters     JSONB NOT NULL DEFAULT '{}',
  is_pinned   BOOLEAN NOT NULL DEFAULT FALSE,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_views_user ON gst_saved_views(user_id);

-- #8 Per-branch branding overrides (company-level branding lives in app_config).
ALTER TABLE gst_branches ADD COLUMN IF NOT EXISTS branding JSONB;

-- #14 Import events.
CREATE TABLE IF NOT EXISTS gst_imports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity       TEXT NOT NULL,
  total_rows   INT,
  imported     INT,
  skipped      INT,
  errors       JSONB,
  status       TEXT NOT NULL DEFAULT 'completed',
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
--  DELIVERY CHALLAN MODULE  (Rule 55 CGST — movement of goods WITHOUT a tax
--  invoice: job work, branch transfer, approval basis, repair, exhibition…).
--  Reuses gst_branches, gst_number_series (doc_type='DC'), gst_attachments,
--  gst_audit_events, gst_comments. Safe to re-run (idempotent).
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE dc_status AS ENUM (
    'draft','pending_approval','approved','rejected','dispatched','in_transit',
    'delivered','partially_delivered','returned','cancelled','converted','closed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS delivery_challans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_no       TEXT,
  challan_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  challan_time     TIME,
  fy               TEXT,
  branch_id        UUID REFERENCES gst_branches(id),
  challan_type     TEXT NOT NULL DEFAULT 'job_work',  -- code from gst_master_data(category='dc_type')
  dispatch_reason  TEXT,                               -- code from gst_master_data(category='dc_reason')
  status           dc_status NOT NULL DEFAULT 'draft',
  currency         TEXT NOT NULL DEFAULT 'INR',
  remarks          TEXT,
  internal_notes   TEXT,

  -- Parties (full address blocks stored as JSONB → new fields need no migration)
  consignor        JSONB NOT NULL DEFAULT '{}',
  consignee        JSONB NOT NULL DEFAULT '{}',
  consignee_kind   TEXT DEFAULT 'registered',         -- registered|unregistered|branch|warehouse|jobworker

  -- Transport + e-Way Bill
  transport        JSONB NOT NULL DEFAULT '{}',        -- transporter/vehicle/driver/LR/mode/multi-vehicle
  is_interstate    BOOLEAN NOT NULL DEFAULT FALSE,
  ewb_id           UUID REFERENCES gst_eway_bills(id),
  ewb_no           TEXT,
  ewb_date         TIMESTAMPTZ,
  ewb_valid_from   TIMESTAMPTZ,
  ewb_valid_to     TIMESTAMPTZ,
  ewb_distance     INT,

  -- Valuation rollups (computed from items)
  total_qty        NUMERIC(16,3) DEFAULT 0,
  taxable_value    NUMERIC(16,2) DEFAULT 0,
  cgst_value       NUMERIC(16,2) DEFAULT 0,
  sgst_value       NUMERIC(16,2) DEFAULT 0,
  igst_value       NUMERIC(16,2) DEFAULT 0,
  cess_value       NUMERIC(16,2) DEFAULT 0,
  total_value      NUMERIC(16,2) DEFAULT 0,

  -- Delivery confirmation (POD)
  delivery         JSONB,                              -- {date,time,receiverName,receiverMobile,signatureFile,podFile,gps}

  -- Lifecycle actors + invoice linkage
  source_invoice_id     UUID REFERENCES invoices(id),
  converted_invoice_id  UUID REFERENCES gst_einvoices(id),
  prepared_by      UUID REFERENCES users(id),
  approved_by      UUID REFERENCES users(id),
  approved_at      TIMESTAMPTZ,
  dispatched_by    UUID REFERENCES users(id),
  dispatched_at    TIMESTAMPTZ,

  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at       TIMESTAMPTZ,
  deleted_by       UUID REFERENCES users(id),
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dc_no_branch ON delivery_challans(branch_id, challan_no) WHERE challan_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dc_status ON delivery_challans(status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_dc_date   ON delivery_challans(challan_date);
CREATE INDEX IF NOT EXISTS idx_dc_branch ON delivery_challans(branch_id);

CREATE TABLE IF NOT EXISTS delivery_challan_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_id       UUID NOT NULL REFERENCES delivery_challans(id) ON DELETE CASCADE,
  line_no          INT NOT NULL DEFAULT 1,
  product_name     TEXT NOT NULL,
  product_code     TEXT,
  sku              TEXT,
  barcode          TEXT,
  hsn              TEXT,
  description      TEXT,
  batch_no         TEXT,
  serial_no        TEXT,
  quantity         NUMERIC(16,3) NOT NULL DEFAULT 0,
  unit             TEXT DEFAULT 'NOS',
  unit_conversion  NUMERIC(16,4),
  gross_weight     NUMERIC(16,3),
  net_weight       NUMERIC(16,3),
  rate             NUMERIC(16,2) DEFAULT 0,             -- per-unit declared value
  taxable_value    NUMERIC(16,2) DEFAULT 0,
  declared_value   NUMERIC(16,2),
  insurance_value  NUMERIC(16,2),
  gst_rate         NUMERIC(6,2) DEFAULT 0,
  cgst_amount      NUMERIC(16,2) DEFAULT 0,
  sgst_amount      NUMERIC(16,2) DEFAULT 0,
  igst_amount      NUMERIC(16,2) DEFAULT 0,
  cess_rate        NUMERIC(6,2) DEFAULT 0,
  cess_amount      NUMERIC(16,2) DEFAULT 0,
  warehouse        TEXT,
  rack             TEXT,
  bin              TEXT,
  returned_qty     NUMERIC(16,3) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_dc_items_challan ON delivery_challan_items(challan_id);

CREATE TABLE IF NOT EXISTS delivery_challan_status_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_id    UUID NOT NULL REFERENCES delivery_challans(id) ON DELETE CASCADE,
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  note          TEXT,
  user_id       UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dc_hist_challan ON delivery_challan_status_history(challan_id, created_at);

CREATE TABLE IF NOT EXISTS delivery_challan_returns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_id      UUID NOT NULL REFERENCES delivery_challans(id) ON DELETE CASCADE,
  return_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  return_qty      NUMERIC(16,3) NOT NULL DEFAULT 0,
  reason          TEXT,
  damage_notes    TEXT,
  transport       JSONB,
  items           JSONB,                                -- [{itemId, qty}]
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dc_returns_challan ON delivery_challan_returns(challan_id);

-- Keep updated_at fresh.
DROP TRIGGER IF EXISTS trg_dc_touch ON delivery_challans;
CREATE TRIGGER trg_dc_touch BEFORE UPDATE ON delivery_challans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Seed configurable challan types (Rule 55 movements) & dispatch reasons ──
INSERT INTO gst_master_data (category, code, name, meta) VALUES
  ('dc_type','job_work','Job Work','{"ewb":"conditional","returnable":true}'),
  ('dc_type','job_work_return','Return from Job Work','{"ewb":"conditional","returnable":false}'),
  ('dc_type','repair_dispatch','Repair Dispatch','{"ewb":"conditional","returnable":true}'),
  ('dc_type','repair_return','Repair Return','{"ewb":"conditional","returnable":false}'),
  ('dc_type','testing','Goods for Testing','{"ewb":"conditional","returnable":true}'),
  ('dc_type','demonstration','Goods for Demonstration','{"ewb":"conditional","returnable":true}'),
  ('dc_type','exhibition','Goods for Exhibition','{"ewb":"conditional","returnable":true}'),
  ('dc_type','approval_basis','Goods Sent on Approval Basis','{"ewb":"conditional","returnable":true}'),
  ('dc_type','sale_or_return','Sale or Return Basis','{"ewb":"conditional","returnable":true}'),
  ('dc_type','branch_transfer','Branch Transfer','{"ewb":"required","returnable":false}'),
  ('dc_type','warehouse_transfer','Warehouse Transfer','{"ewb":"required","returnable":false}'),
  ('dc_type','ckd','CKD Dispatch','{"ewb":"required","returnable":false}'),
  ('dc_type','skd','SKD Dispatch','{"ewb":"required","returnable":false}'),
  ('dc_type','multiple_lots','Goods in Multiple Lots','{"ewb":"required","returnable":false}'),
  ('dc_type','returnable_packaging','Returnable Packaging','{"ewb":"conditional","returnable":true}'),
  ('dc_type','liquid_gas','Liquid Gas Dispatch','{"ewb":"required","returnable":false}'),
  ('dc_type','non_supply','Non-Supply Movement','{"ewb":"conditional","returnable":false}'),
  ('dc_type','internal_transfer','Internal Inventory Transfer','{"ewb":"conditional","returnable":false}'),
  ('dc_type','consignment','Consignment Transfer','{"ewb":"required","returnable":false}'),
  ('dc_type','other','Other Permissible Movement','{"ewb":"conditional","returnable":false}')
ON CONFLICT (category, code) DO NOTHING;

INSERT INTO gst_master_data (category, code, name) VALUES
  ('dc_reason','job_work','Job Work'),
  ('dc_reason','repair','Repair / Maintenance'),
  ('dc_reason','demonstration','Demonstration'),
  ('dc_reason','testing','Testing'),
  ('dc_reason','exhibition','Exhibition'),
  ('dc_reason','transfer','Stock / Branch Transfer'),
  ('dc_reason','sample','Sample'),
  ('dc_reason','approval','On Approval')
ON CONFLICT (category, code) DO NOTHING;

-- Default DC number series (all branches; {BRANCH}/DC/{FY}/00001).
INSERT INTO gst_number_series (branch_id, doc_type, name, prefix, padding, next_number, fy_reset, current_fy)
SELECT NULL,'DC','Delivery Challan (all branches)','{BRANCH}/DC/{FY}/',5,1,TRUE,
       (CASE WHEN EXTRACT(MONTH FROM now())>=4
             THEN to_char(now(),'YY')||'-'||to_char(now()+interval '1 year','YY')
             ELSE to_char(now()-interval '1 year','YY')||'-'||to_char(now(),'YY') END)
WHERE NOT EXISTS (SELECT 1 FROM gst_number_series WHERE doc_type='DC');

-- §9 Local file storage — checksum + version metadata on attachments.
ALTER TABLE gst_attachments ADD COLUMN IF NOT EXISTS checksum TEXT;
ALTER TABLE gst_attachments ADD COLUMN IF NOT EXISTS version  INT NOT NULL DEFAULT 1;
ALTER TABLE gst_attachments ADD COLUMN IF NOT EXISTS folder   TEXT;

-- Challan → standard invoice link (challans now convert to a normal invoice).
ALTER TABLE delivery_challans ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id);

-- Editable letterhead / office address printed on the e-Invoice PDF. This is a
-- cosmetic field only (NOT part of the IRP payload, and separate from the
-- supplier/seller block). It is selectable while generating and stays editable
-- even after the IRN is locked, so the operator can reprint with a corrected
-- office address without touching the registered crunch data.
ALTER TABLE gst_einvoices ADD COLUMN IF NOT EXISTS header_address TEXT;

-- §2 Standard Invoice — accounting-grade fields + line items + EWB link (§4).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name     TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_gstin    TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_address   TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shipping_address  TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS place_of_supply   TEXT;          -- 2-digit state code
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branch_id         UUID REFERENCES gst_branches(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cgst_amount       NUMERIC(16,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sgst_amount       NUMERIC(16,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS igst_amount       NUMERIC(16,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS linked_ewb_id     UUID REFERENCES gst_eway_bills(id);

-- EPC tax-invoice header fields (ARRAYS running-account format): a free-text
-- "Type of Invoice" subtitle (e.g. "Supply and Installation"), purchase-order
-- reference + date, an optional site/works address block (multi-line), and a
-- flag controlling whether a Measurement Sheet page is appended to the PDF.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS supply_type      TEXT;   -- "Type of Invoice" line
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS po_no            TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS po_date          DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS site_address     TEXT;   -- "Site Address" block (overrides shipping)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS with_measurement BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS header_text      TEXT;   -- operator-chosen letterhead name (overrides branding)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS footer_text      TEXT;   -- operator-chosen footer slogan line
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS header_address   TEXT;   -- operator-chosen letterhead address
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS header_cin       TEXT;   -- operator-chosen letterhead CIN
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS header_email     TEXT;   -- operator-chosen letterhead email
-- Soft delete (recoverable from the System Recovery Center).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_deleted       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at       TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_by       UUID REFERENCES users(id);

-- Soft delete on outgoing payments (recoverable from the Recovery Center).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- Soft delete on incoming receipts (recoverable from the Recovery Center).
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- Redefine the top-vendor-spend view to ignore soft-deleted payments so the
-- dashboard "Top Vendor Spend" updates live when a payment is deleted. (Defined
-- here, after the is_deleted column exists.)
CREATE OR REPLACE VIEW v_vendor_spend AS
SELECT v.id AS vendor_id, v.name AS vendor_name, v.category,
  COALESCE(SUM(p.amount),0) AS total_spent,
  COUNT(p.id) AS payment_count,
  MAX(p.payment_date) AS last_payment_date
FROM vendors v
LEFT JOIN payments p ON p.vendor_id = v.id AND p.is_deleted = FALSE
GROUP BY v.id, v.name, v.category;

-- Soft delete on projects (recoverable from the Recovery Center).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

-- Purchase-order reference on projects and sites (editable after creation).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS po_date   DATE;
ALTER TABLE sites    ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE sites    ADD COLUMN IF NOT EXISTS po_date   DATE;
ALTER TABLE sites    ADD COLUMN IF NOT EXISTS capacity_kw NUMERIC(14,2);

-- Project payment terms / milestone schedule. Each row is a stage ("after X
-- work, release Y") that the operator ticks off as the work completes; the due
-- amount is a percentage of the contract value or a fixed figure, and a
-- released figure tracks how much has actually been paid against that stage.
CREATE TABLE IF NOT EXISTS project_payment_terms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  seq             INT NOT NULL DEFAULT 1,
  title           TEXT NOT NULL,                 -- work / milestone description
  percent         NUMERIC(6,2),                  -- % of contract value (if amount null)
  amount          NUMERIC(16,2),                 -- fixed due amount (overrides percent)
  is_done         BOOLEAN NOT NULL DEFAULT FALSE, -- work completed (checklist)
  done_at         TIMESTAMPTZ,
  released_amount NUMERIC(16,2) NOT NULL DEFAULT 0, -- amount actually released so far
  released_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ppt_project ON project_payment_terms(project_id);

-- ── Payment allocation / tagging ─────────────────────────────────────────────
-- A single bank transaction (receipt or payment) can be split across several
-- projects / sites / milestones, or tagged as "Other" with free text. These are
-- SEPARATE tables — the original receipts/payments rows are never modified.
-- project_id/site_id/milestone_id all NULL = an "Other" line (description holds
-- the custom text).
CREATE TABLE IF NOT EXISTS incoming_payment_allocations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id   UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  milestone_id UUID REFERENCES project_payment_terms(id) ON DELETE SET NULL,
  description  TEXT,
  amount       NUMERIC(16,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ipa_receipt ON incoming_payment_allocations(receipt_id);
CREATE INDEX IF NOT EXISTS idx_ipa_project ON incoming_payment_allocations(project_id);

CREATE TABLE IF NOT EXISTS outgoing_payment_allocations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id  UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  site_id     UUID REFERENCES sites(id) ON DELETE SET NULL,
  description TEXT,
  amount      NUMERIC(16,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opa_payment ON outgoing_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_opa_project ON outgoing_payment_allocations(project_id);
CREATE INDEX IF NOT EXISTS idx_opa_site    ON outgoing_payment_allocations(site_id);

-- Allocation-aware views: use the explicit split when one exists, otherwise fall
-- back to the transaction's own single project/site (so existing un-tagged data
-- rolls up exactly as before). All reports/rollups read these.
CREATE OR REPLACE VIEW v_outgoing_alloc AS
  SELECT a.payment_id AS source_id, a.project_id, a.site_id, a.amount, a.description, p.payment_date AS dt
    FROM outgoing_payment_allocations a
    JOIN payments p ON p.id = a.payment_id AND p.is_deleted = FALSE
  UNION ALL
  SELECT p.id, p.project_id, p.site_id, p.amount, p.comment, p.payment_date
    FROM payments p
   WHERE p.is_deleted = FALSE
     AND NOT EXISTS (SELECT 1 FROM outgoing_payment_allocations a WHERE a.payment_id = p.id);

CREATE OR REPLACE VIEW v_incoming_alloc AS
  SELECT a.receipt_id AS source_id, a.project_id, a.milestone_id, a.amount, a.description, r.credited_date AS dt
    FROM incoming_payment_allocations a
    JOIN receipts r ON r.id = a.receipt_id AND r.is_deleted = FALSE
  UNION ALL
  SELECT r.id, r.project_id, NULL::uuid, r.credited_amount, r.comment, r.credited_date
    FROM receipts r
   WHERE r.is_deleted = FALSE
     AND NOT EXISTS (SELECT 1 FROM incoming_payment_allocations a WHERE a.receipt_id = r.id);

CREATE TABLE IF NOT EXISTS invoice_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_no       INT NOT NULL DEFAULT 1,
  description   TEXT NOT NULL,
  hsn           TEXT,
  quantity      NUMERIC(16,3) NOT NULL DEFAULT 1,
  unit          TEXT DEFAULT 'NOS',
  rate          NUMERIC(16,2) NOT NULL DEFAULT 0,
  taxable_value NUMERIC(16,2) NOT NULL DEFAULT 0,
  gst_rate      NUMERIC(6,2)  NOT NULL DEFAULT 0,
  cgst_amount   NUMERIC(16,2) NOT NULL DEFAULT 0,
  sgst_amount   NUMERIC(16,2) NOT NULL DEFAULT 0,
  igst_amount   NUMERIC(16,2) NOT NULL DEFAULT 0,
  amount        NUMERIC(16,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- Running-account / measurement-sheet quantities per line. quantity (above) is
-- the PRESENT bill quantity; order_qty is the total contracted quantity and
-- previous_qty is what was billed in earlier running bills. Total = previous +
-- present; amounts are derived from rate in the PDF/measurement sheet.
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS order_qty    NUMERIC(16,3);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS previous_qty NUMERIC(16,3) NOT NULL DEFAULT 0;

-- Office/branch selection on quotations
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES gst_branches(id) ON DELETE SET NULL;

-- ============================================================================
--  FINANCIAL CLASSIFICATION  (functional-audit 2026-08)
--  Fixes: internal transfers booked as income/expense; own company created as a
--  party; loan/OD financing counted as operating cash. A transaction now carries
--  a `txn_kind` so the dashboards can exclude non-operating money.
--    payments.txn_kind : 'expense' (default) | 'internal_transfer' | 'financing'
--    receipts.txn_kind : 'income'  (default) | 'internal_transfer' | 'financing' | 'refund'
--  Only 'expense'/'income' feed the operating income & expense totals.
-- ============================================================================

-- Own bank accounts (OD, current, savings…). A statement credit/debit whose
-- counterparty matches one of these is an INTERNAL TRANSFER, not real income or
-- expense — it must never create a client/vendor or hit a party ledger.
CREATE TABLE IF NOT EXISTS own_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number TEXT NOT NULL,
  holder_name    TEXT,                        -- name as it appears in narrations (for name-based match)
  bank_name      TEXT,
  account_type   TEXT DEFAULT 'current',      -- current | od | savings | cc | other
  label          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  notes          TEXT,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_number)
);
CREATE INDEX IF NOT EXISTS idx_own_accounts_active ON own_accounts(is_active);

ALTER TABLE payments             ADD COLUMN IF NOT EXISTS txn_kind TEXT NOT NULL DEFAULT 'expense';
ALTER TABLE receipts             ADD COLUMN IF NOT EXISTS txn_kind TEXT NOT NULL DEFAULT 'income';
ALTER TABLE bank_statement_lines ADD COLUMN IF NOT EXISTS txn_kind TEXT;   -- set to 'internal_transfer' when a leg matches an own account
CREATE INDEX IF NOT EXISTS idx_payments_kind ON payments(txn_kind);
CREATE INDEX IF NOT EXISTS idx_receipts_kind ON receipts(txn_kind);

-- Allocation-aware views must NOT roll internal-transfer / financing money into
-- project spend or receipts. Only operating money is attributed to projects.
CREATE OR REPLACE VIEW v_outgoing_alloc AS
  SELECT a.payment_id AS source_id, a.project_id, a.site_id, a.amount, a.description, p.payment_date AS dt
    FROM outgoing_payment_allocations a
    JOIN payments p ON p.id = a.payment_id AND p.is_deleted = FALSE AND p.txn_kind = 'expense'
  UNION ALL
  SELECT p.id, p.project_id, p.site_id, p.amount, p.comment, p.payment_date
    FROM payments p
   WHERE p.is_deleted = FALSE AND p.txn_kind = 'expense'
     AND NOT EXISTS (SELECT 1 FROM outgoing_payment_allocations a WHERE a.payment_id = p.id);

CREATE OR REPLACE VIEW v_incoming_alloc AS
  SELECT a.receipt_id AS source_id, a.project_id, a.milestone_id, a.amount, a.description, r.credited_date AS dt
    FROM incoming_payment_allocations a
    JOIN receipts r ON r.id = a.receipt_id AND r.is_deleted = FALSE AND r.txn_kind = 'income'
  UNION ALL
  SELECT r.id, r.project_id, NULL::uuid, r.credited_amount, r.comment, r.credited_date
    FROM receipts r
   WHERE r.is_deleted = FALSE AND r.txn_kind = 'income'
     AND NOT EXISTS (SELECT 1 FROM incoming_payment_allocations a WHERE a.receipt_id = r.id);

-- Vendor spend must exclude internal-transfer / financing payments too.
CREATE OR REPLACE VIEW v_vendor_spend AS
SELECT v.id AS vendor_id, v.name AS vendor_name, v.category,
  COALESCE(SUM(p.amount),0) AS total_spent,
  COUNT(p.id) AS payment_count,
  MAX(p.payment_date) AS last_payment_date
FROM vendors v
LEFT JOIN payments p ON p.vendor_id = v.id AND p.is_deleted = FALSE AND p.txn_kind = 'expense'
GROUP BY v.id, v.name, v.category;

-- Proof-archive (§ storage): once a proof/statement file is older than ~30 days
-- it is moved into a monthly zip to save disk. This column points at that zip;
-- the document endpoint serves the entry (by stored_name) straight from it.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_zip TEXT;

-- Vendor refunds (#5): a credit that is money coming BACK from a vendor is not
-- client income. A receipt tagged txn_kind='refund' can point at the vendor so
-- it posts a credit to that vendor's ledger (reducing net amount paid) instead.
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_receipts_vendor ON receipts(vendor_id);
