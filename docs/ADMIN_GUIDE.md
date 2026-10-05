# Administrator Handbook

For Admins and the Editor (super-admin). Everything here is reachable from the
left menu under **GST Compliance** or the standard admin pages.

---

## 1. Users & roles
- **Users** (sidebar) → create/disable accounts and set roles.
- Roles: **Operator** (maker — data entry), **Admin** (checker — submit/cancel + view/export), **Auditor** (read-only), **Editor** (super-admin).
- Maker-checker: the operator who prepares a document cannot submit/cancel it — an Admin must.
- Role changes are audited. The protected `editor` account cannot be removed and is hidden from the list (but appears in the audit log).

## 2. Branches & GSTINs
- **GST Compliance → Branches & GSTINs.** Add each registration (code, GSTIN, legal/trade name, state, address).
- Set one as **Default**. Every document is stamped with its branch; the **branch switcher** (top bar) filters dashboards/lists.

## 3. Number series
- **GST Compliance → Number Series.** FY-aware templates with tokens `{BRANCH} {FY} {DOCTYPE} {SEQ}` and zero-padding. Live preview of the next number.
- Keep the full number ≤ 16 characters (IRP limit). For 4-char branch codes use padding ≤ 5.
- Blank document numbers on new invoices are auto-allocated from the matching series. Lock a series to freeze its rule.

## 4. GST & email configuration (Integrations)
- **GST Compliance → Integrations.** Configure **GST mode (Simulation/Live)**, IRP/GSP credentials, URLs, and **SMTP email** — no source-code edits.
- Use **Test Connection**. Changes need **2-step verification** and are audited.
- Switching to **Live** here flips the environment immediately (and on restart). Confirm the red **LIVE** banner appears.

## 5. Branding
- **GST Compliance → Branding.** Upload **logo / signature / stamp**, set header/footer text, **watermark**, terms and legal disclaimer — company-wide or per branch. **Preview Invoice / Preview EWB** renders a sample PDF with your branding before saving.

## 6. Scheduled reports
- **GST Compliance → Scheduled Reports.** Schedule any of the 8 compliance reports daily/weekly/monthly. They run when the app is open (catch-up) and can be run on demand. Email delivery activates once SMTP is configured.

## 7. Backup & Disaster Recovery
- **GST Compliance → Backup & Recovery.** **Backup Now** creates a full-system ZIP (all tables + attachments). **Verify**, **DR Test** (safe simulation), **Preview Restore**, then **Full/Partial Restore** (additive, non-destructive, 2-step verified).
- Set **retention** (daily/weekly/monthly) and the storage threshold. The system warns if today's backup is missing (including on app close).
- Download the ZIP regularly for off-site safety.

## 8. Maintenance mode
- **GST Compliance → System Control.** Switch **Normal / Read-Only / Maintenance**. Read-Only freezes writes; Maintenance restricts access to admins with a notice to others. 2-step verified + audited. The mode shows as an app-wide banner.

## 9. Diagnostics & readiness
- **Diagnostics** — subsystem health (DB, storage, backup, scheduler, adapter, email, validation, PDF, import, reporting) + a one-click **Test Suite**.
- **Production Readiness** — a 16-area pre-deployment review with pass/warn/fail and recommendations; exportable.

## 10. Configuration export
- **System Control → Export Config** — roles, branches, GST settings, number series, schedules, notification rules and branding as JSON for migration/recovery/replication.

## Day-to-day checklist
- [ ] Daily backup taken & verified.
- [ ] No critical alerts (Alerts) or critical reconciliation items.
- [ ] Diagnostics all healthy.
- [ ] Pending approvals cleared (checker).
