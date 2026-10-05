-- ============================================================================
--  Solar EPC ERP & Financial Intelligence Platform
--  PostgreSQL schema
--  Load with:  psql -d solar_epc -f schema.sql
-- ============================================================================

-- Extensions ----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- Enums ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role          AS ENUM ('admin', 'operator', 'editor', 'auditor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 'editor' = super-admin (added separately in migrate.js for existing DBs).

DO $$ BEGIN
  CREATE TYPE payment_mode       AS ENUM ('neft','rtgs','imps','upi','net_banking','cheque','cash','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status     AS ENUM ('draft','raised','sent','partially_paid','paid','overdue','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_type       AS ENUM ('proforma','tax');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_link       AS ENUM ('pending','attached');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ledger_party       AS ENUM ('vendor','client','employee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- For databases created before 'employee' existed (enum value added separately
-- in migrate.js because ALTER TYPE ... ADD VALUE cannot run in a transaction).

DO $$ BEGIN
  CREATE TYPE ledger_direction   AS ENUM ('debit','credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE recon_status       AS ENUM ('matched','unmatched','duplicate','pending_classification');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE material_status    AS ENUM ('purchased','dispatched','in_transit','delivered','geo_verified','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Updated-at trigger helper ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ============================================================================
--  USERS & AUTH
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'operator',
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  is_protected  BOOLEAN     NOT NULL DEFAULT false,  -- super-admin: cannot be removed/altered by others
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
--  AUDIT LOG  (every write action is recorded)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name    TEXT,
  action       TEXT NOT NULL,             -- create | update | delete | login | upload | reconcile
  entity       TEXT NOT NULL,             -- table / module name
  entity_id    TEXT,
  changes      JSONB,                     -- { field: { from, to } } or full snapshot
  ip_address   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_time   ON audit_logs(created_at DESC);

-- ============================================================================
--  PROJECTS & SITES
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT UNIQUE,
  name         TEXT NOT NULL,
  client_name  TEXT,                       -- denormalized convenience
  client_id    UUID,                       -- FK added after clients table
  capacity_kw  NUMERIC(14,2),
  budget       NUMERIC(16,2) DEFAULT 0,
  contract_value NUMERIC(16,2) DEFAULT 0,
  location     TEXT,
  status       TEXT NOT NULL DEFAULT 'active', -- active | on_hold | completed | cancelled
  start_date   DATE,
  end_date     DATE,
  notes        TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_projects_updated ON projects;
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS sites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code         TEXT,
  name         TEXT NOT NULL,
  location     TEXT,
  latitude     NUMERIC(10,7),
  longitude    NUMERIC(10,7),
  budget       NUMERIC(16,2) DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_sites_updated ON sites;
CREATE TRIGGER trg_sites_updated BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_sites_project ON sites(project_id);

-- ============================================================================
--  VENDORS & CLIENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS vendors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  gstin        TEXT,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  bank_account TEXT,
  ifsc         TEXT,
  category     TEXT,                       -- steel | panels | cables | transport | labour ...
  opening_balance NUMERIC(16,2) DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_vendors_updated ON vendors;
CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS employees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  employee_code TEXT,
  designation   TEXT,
  department    TEXT,
  phone         TEXT,
  email         TEXT,
  bank_account  TEXT,
  ifsc          TEXT,
  opening_balance NUMERIC(16,2) DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_employees_updated ON employees;
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS clients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  gstin        TEXT,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  opening_balance NUMERIC(16,2) DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_clients_updated ON clients;
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Late FK: projects.client_id -> clients.id
DO $$ BEGIN
  ALTER TABLE projects
    ADD CONSTRAINT fk_projects_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
--  EXPENSE CATEGORIES & TAGS  (classification dictionary)
-- ============================================================================
CREATE TABLE IF NOT EXISTS expense_categories (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL UNIQUE,
  kind      TEXT NOT NULL DEFAULT 'expense' -- expense | revenue
);

-- ============================================================================
--  DOCUMENTS  (generic file store, polymorphic association)
-- ============================================================================
CREATE TABLE IF NOT EXISTS documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          TEXT NOT NULL,             -- payment_proof | receipt_proof | invoice | bank_statement | challan | eway | geo_photo | contract
  entity        TEXT,                      -- linked table
  entity_id     UUID,
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT,
  storage_path  TEXT NOT NULL,
  ocr_text      TEXT,
  ocr_json      JSONB,
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_documents_kind   ON documents(kind);

-- ============================================================================
--  OUTGOING PAYMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id    TEXT,                     -- bank reference / UTR
  amount          NUMERIC(16,2) NOT NULL,
  payment_date    DATE,
  beneficiary_name TEXT,
  account_details TEXT,
  bank_remarks    TEXT,                     -- raw remark from bank/OCR
  comment         TEXT NOT NULL,            -- MANDATORY operator comment
  payment_mode    payment_mode DEFAULT 'neft',
  network_type    TEXT,                     -- NEFT/RTGS/etc. as read from proof

  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  site_id         UUID REFERENCES sites(id) ON DELETE SET NULL,
  vendor_id       UUID REFERENCES vendors(id) ON DELETE SET NULL,
  employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  category_id     UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  material_type   TEXT,
  tags            TEXT[] DEFAULT '{}',

  invoice_status  invoice_link NOT NULL DEFAULT 'pending', -- pending | attached
  invoice_id      UUID,                     -- FK added after invoices table
  proof_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  source          TEXT NOT NULL DEFAULT 'manual', -- manual | reconciliation
  recon_item_id   UUID,                     -- link back to bank line if created via recon

  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_payments_updated ON payments;
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_payments_vendor  ON payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_payments_project ON payments(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_date    ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_ref     ON payments(reference_id);

-- ============================================================================
--  CLIENTS: INVOICES (proforma + tax)
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT NOT NULL,
  type            invoice_type NOT NULL DEFAULT 'tax',
  status          invoice_status NOT NULL DEFAULT 'draft',
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  site_id         UUID REFERENCES sites(id) ON DELETE SET NULL,
  issue_date      DATE,
  due_date        DATE,
  taxable_amount  NUMERIC(16,2) NOT NULL DEFAULT 0,
  gst_amount      NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(16,2) NOT NULL DEFAULT 0,
  amount_received NUMERIC(16,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  document_id     UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_invoices_updated ON invoices;
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_invoices_client  ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status  ON invoices(status);

-- Late FK: payments.invoice_id -> invoices.id (vendor bill linkage uses same table? No:
-- vendor invoices are tracked via invoice_status + documents; payments.invoice_id links
-- a payment to a sales invoice only when relevant — kept nullable / soft.)
DO $$ BEGIN
  ALTER TABLE payments
    ADD CONSTRAINT fk_payments_invoice
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
--  INCOMING RECEIPTS (client payments)
-- ============================================================================
CREATE TABLE IF NOT EXISTS receipts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id    TEXT,
  credited_amount NUMERIC(16,2) NOT NULL,
  credited_date   DATE,
  account_details TEXT,
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  site_id         UUID REFERENCES sites(id) ON DELETE SET NULL,
  deduction_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  deduction_reason TEXT,
  tds_amount      NUMERIC(16,2) NOT NULL DEFAULT 0,
  retention_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  comment         TEXT,
  proof_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  source          TEXT NOT NULL DEFAULT 'manual',
  recon_item_id   UUID,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_receipts_updated ON receipts;
CREATE TRIGGER trg_receipts_updated BEFORE UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_receipts_client ON receipts(client_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date   ON receipts(credited_date DESC);

-- ============================================================================
--  LEDGER ENTRIES  (double-sided party ledger for vendors & clients)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ledger_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_type   ledger_party     NOT NULL,
  party_id     UUID             NOT NULL,   -- vendor_id or client_id
  direction    ledger_direction NOT NULL,   -- debit | credit
  amount       NUMERIC(16,2)    NOT NULL,
  entry_date   DATE             NOT NULL DEFAULT CURRENT_DATE,
  description  TEXT,
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  site_id      UUID REFERENCES sites(id) ON DELETE SET NULL,
  source_type  TEXT,                         -- payment | receipt | invoice | opening | adjustment
  source_id    UUID,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_party  ON ledger_entries(party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_ledger_source ON ledger_entries(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_ledger_date   ON ledger_entries(entry_date DESC);

-- ============================================================================
--  BANK STATEMENT RECONCILIATION
-- ============================================================================
CREATE TABLE IF NOT EXISTS bank_statements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT,                        -- e.g. "HDFC - April 2026"
  bank_name     TEXT,
  account_number TEXT,
  period_start  DATE,
  period_end    DATE,
  document_id   UUID REFERENCES documents(id) ON DELETE SET NULL,
  total_lines   INTEGER DEFAULT 0,
  matched_count INTEGER DEFAULT 0,
  unmatched_count INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id  UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  txn_date      DATE,
  description   TEXT,
  reference_id  TEXT,
  debit         NUMERIC(16,2) DEFAULT 0,
  credit        NUMERIC(16,2) DEFAULT 0,
  balance       NUMERIC(16,2),
  status        recon_status NOT NULL DEFAULT 'unmatched',
  matched_type  TEXT,                        -- payment | receipt
  matched_id    UUID,
  comment       TEXT,                        -- mandatory before resolving an unmatched line
  classified    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bsl_statement ON bank_statement_lines(statement_id);
CREATE INDEX IF NOT EXISTS idx_bsl_status    ON bank_statement_lines(status);

-- ============================================================================
--  MATERIAL / PROCUREMENT  (schema-ready for later module)
-- ============================================================================
CREATE TABLE IF NOT EXISTS materials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
  site_id       UUID REFERENCES sites(id) ON DELETE SET NULL,
  vendor_id     UUID REFERENCES vendors(id) ON DELETE SET NULL,
  quantity      NUMERIC(16,2) DEFAULT 0,
  unit          TEXT,
  rate          NUMERIC(16,2) DEFAULT 0,
  payment_id    UUID REFERENCES payments(id) ON DELETE SET NULL,
  invoice_id    UUID REFERENCES invoices(id) ON DELETE SET NULL,
  received_quantity NUMERIC(16,2) DEFAULT 0,
  shortage_quantity NUMERIC(16,2) DEFAULT 0,
  status        material_status NOT NULL DEFAULT 'purchased',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_materials_updated ON materials;
CREATE TRIGGER trg_materials_updated BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Logistics / E-Way bills (schema-ready) ------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id   UUID REFERENCES materials(id) ON DELETE CASCADE,
  transporter   TEXT,
  vehicle_no    TEXT,
  dispatch_date DATE,
  expected_date DATE,
  actual_date   DATE,
  eway_number   TEXT,
  eway_validity DATE,
  delivery_location TEXT,
  challan_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  eway_document_id    UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Geo-tagged verification (schema-ready) ------------------------------------
CREATE TABLE IF NOT EXISTS geo_verifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id   UUID REFERENCES materials(id) ON DELETE SET NULL,
  site_id       UUID REFERENCES sites(id) ON DELETE SET NULL,
  latitude      NUMERIC(10,7),
  longitude     NUMERIC(10,7),
  received_quantity NUMERIC(16,2),
  photo_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  verified_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
--  Convenience views for analytics
-- ============================================================================
CREATE OR REPLACE VIEW v_vendor_balances AS
SELECT
  v.id   AS vendor_id,
  v.name AS vendor_name,
  COALESCE(v.opening_balance,0)
    + COALESCE(SUM(CASE WHEN le.direction='credit' THEN le.amount ELSE 0 END),0)
    - COALESCE(SUM(CASE WHEN le.direction='debit'  THEN le.amount ELSE 0 END),0) AS balance,
  COALESCE(SUM(CASE WHEN le.direction='debit' THEN le.amount ELSE 0 END),0) AS total_paid
FROM vendors v
LEFT JOIN ledger_entries le
  ON le.party_type='vendor' AND le.party_id=v.id
GROUP BY v.id, v.name, v.opening_balance;

-- Outstanding = unpaid invoiced amount only. Receipts received WITHOUT a matching
-- invoice (e.g. advances or bank-imported credits) must NOT create negative or
-- phantom receivables — they show under "received", never as outstanding.
CREATE OR REPLACE VIEW v_client_balances AS
SELECT
  c.id   AS client_id,
  c.name AS client_name,
  COALESCE(SUM(CASE WHEN le.direction='debit'  THEN le.amount ELSE 0 END),0) AS total_billed,
  COALESCE(SUM(CASE WHEN le.direction='credit' THEN le.amount ELSE 0 END),0) AS total_received,
  GREATEST(0,
    COALESCE(c.opening_balance,0)
      + COALESCE(SUM(CASE WHEN le.direction='debit'  THEN le.amount ELSE 0 END),0)
      - COALESCE(SUM(CASE WHEN le.direction='credit' THEN le.amount ELSE 0 END),0)
  ) AS outstanding,
  -- Credits beyond what was billed = unallocated advance (informational).
  GREATEST(0,
    COALESCE(SUM(CASE WHEN le.direction='credit' THEN le.amount ELSE 0 END),0)
      - COALESCE(c.opening_balance,0)
      - COALESCE(SUM(CASE WHEN le.direction='debit' THEN le.amount ELSE 0 END),0)
  ) AS advance_balance
FROM clients c
LEFT JOIN ledger_entries le
  ON le.party_type='client' AND le.party_id=c.id
GROUP BY c.id, c.name, c.opening_balance;

-- ============================================================================
--  ENTERPRISE UPGRADE (ARRAYS INGENIERIA)
--  Idempotent additions: Vendor Master, IDBI statement structure, Quotes,
--  Document Vault. Safe to re-run.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- fuzzy vendor name matching

-- Super-admin protection flag (for existing databases)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT false;

-- Vendor Master enrichment -------------------------------------------------
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS material_type TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS beneficiary_id TEXT;       -- short code / nickname key
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS is_candidate BOOLEAN DEFAULT false; -- auto-created, needs enrichment
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS first_seen_date DATE;

-- Employees as a payable party (salary / labour advances etc.)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_employee ON payments(employee_id);

CREATE OR REPLACE VIEW v_employee_balances AS
SELECT
  e.id   AS employee_id,
  e.name AS employee_name,
  COALESCE(SUM(CASE WHEN le.direction='debit'  THEN le.amount ELSE 0 END),0) AS total_paid,
  COALESCE(e.opening_balance,0)
    + COALESCE(SUM(CASE WHEN le.direction='credit' THEN le.amount ELSE 0 END),0)
    - COALESCE(SUM(CASE WHEN le.direction='debit'  THEN le.amount ELSE 0 END),0) AS balance
FROM employees e
LEFT JOIN ledger_entries le ON le.party_type='employee' AND le.party_id=e.id
GROUP BY e.id, e.name, e.opening_balance;

-- Multiple bank accounts / labour accounts per vendor (auto-map key)
CREATE TABLE IF NOT EXISTS vendor_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  ifsc           TEXT,
  label          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_number)
);
CREATE INDEX IF NOT EXISTS idx_vendor_accounts_vendor ON vendor_accounts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_name_trgm ON vendors USING gin (name gin_trgm_ops);

-- IDBI statement structured fields ----------------------------------------
ALTER TABLE bank_statement_lines ADD COLUMN IF NOT EXISTS mode TEXT;
ALTER TABLE bank_statement_lines ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE bank_statement_lines ADD COLUMN IF NOT EXISTS beneficiary TEXT;
ALTER TABLE bank_statement_lines ADD COLUMN IF NOT EXISTS txn_time TEXT;
ALTER TABLE bank_statement_lines ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;
ALTER TABLE bank_statement_lines ADD COLUMN IF NOT EXISTS vendor_confidence NUMERIC(5,2);
ALTER TABLE bank_statement_lines ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE bank_statement_lines ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE bank_statement_lines ADD COLUMN IF NOT EXISTS serial_no INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_candidate BOOLEAN DEFAULT false;

-- ============================================================================
--  QUOTES / SOLAR ESTIMATION
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE quote_status AS ENUM ('draft','sent','approved','rejected','revised','converted','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS quotes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number   TEXT NOT NULL,
  version        INTEGER NOT NULL DEFAULT 1,
  parent_id      UUID REFERENCES quotes(id) ON DELETE SET NULL,
  status         quote_status NOT NULL DEFAULT 'draft',
  client_id      UUID REFERENCES clients(id) ON DELETE SET NULL,
  client_name    TEXT,
  project_id     UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_type   TEXT,                  -- rooftop | ground_mount | industrial | commercial
  capacity_kw    NUMERIC(14,2) NOT NULL DEFAULT 0,
  location       TEXT,
  issue_date     DATE,
  valid_until    DATE,
  -- calculator inputs + computed breakdown stored as JSONB for full traceability
  inputs         JSONB NOT NULL DEFAULT '{}',
  -- project-info questionnaire that drives the premium proposal / quotation PDFs
  proposal_inputs JSONB NOT NULL DEFAULT '{}',
  line_items     JSONB NOT NULL DEFAULT '[]',
  subtotal       NUMERIC(16,2) NOT NULL DEFAULT 0,
  contingency_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  margin_amount  NUMERIC(16,2) NOT NULL DEFAULT 0,
  taxable_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
  gst_amount     NUMERIC(16,2) NOT NULL DEFAULT 0,
  total_amount   NUMERIC(16,2) NOT NULL DEFAULT 0,
  cost_amount    NUMERIC(16,2) NOT NULL DEFAULT 0,  -- internal cost (for margin analysis)
  per_watt       NUMERIC(10,2),
  notes          TEXT,
  terms          TEXT,
  exclusions     TEXT,
  approved_by    TEXT,
  approved_at    TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Quote enrichment: subsidy + savings + naming for client-ready PDFs
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS project_name TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS site_name TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS subsidy_amount NUMERIC(16,2) DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS net_cost NUMERIC(16,2) DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS annual_savings NUMERIC(16,2) DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payback_years NUMERIC(8,2) DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS lifetime_savings NUMERIC(16,2) DEFAULT 0;
-- Soft delete: keep the row (restorable from Trash) instead of hard-deleting
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_quotes_deleted ON quotes(deleted_at);
DROP TRIGGER IF EXISTS trg_quotes_updated ON quotes;
CREATE TRIGGER trg_quotes_updated BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_quotes_client ON quotes(client_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);

-- ============================================================================
--  DOCUMENT VAULT
-- ============================================================================
CREATE TABLE IF NOT EXISTS vault_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  category       TEXT NOT NULL,         -- PAN | GST | CIN | AOA | MOA | ISO | Bank | Cheque | Agreement | Contract | NDA | PO | Insurance | Compliance | Datasheet | Registration | Tender | Other
  description    TEXT,
  tags           TEXT[] DEFAULT '{}',
  document_id    UUID REFERENCES documents(id) ON DELETE SET NULL,
  version        INTEGER NOT NULL DEFAULT 1,
  issue_date     DATE,
  expiry_date    DATE,
  reference_no   TEXT,
  uploaded_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_vault_updated ON vault_documents;
CREATE TRIGGER trg_vault_updated BEFORE UPDATE ON vault_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_vault_category ON vault_documents(category);
CREATE INDEX IF NOT EXISTS idx_vault_expiry   ON vault_documents(expiry_date);

CREATE TABLE IF NOT EXISTS vault_document_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id        UUID NOT NULL REFERENCES vault_documents(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  document_id     UUID REFERENCES documents(id) ON DELETE SET NULL,
  note            TEXT,
  uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vault_versions ON vault_document_versions(vault_id);

-- Vendor-wise expenditure view ---------------------------------------------
CREATE OR REPLACE VIEW v_vendor_spend AS
SELECT v.id AS vendor_id, v.name AS vendor_name, v.category,
  COALESCE(SUM(p.amount),0) AS total_spent,
  COUNT(p.id) AS payment_count,
  MAX(p.payment_date) AS last_payment_date
FROM vendors v
LEFT JOIN payments p ON p.vendor_id = v.id
GROUP BY v.id, v.name, v.category;
