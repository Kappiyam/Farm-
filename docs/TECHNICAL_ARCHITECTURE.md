# Technical Architecture — Kappiyam Farm Management

**Status:** Working design, derived from the Standard Farm Management Application PSD v1.2 and Kappiyam deployment PSD v0.4. Both specifications remain drafts pending formal approval.  
**Date:** 14 November 2026  
**Implementation branch:** `foundation/bootstrap`

## 1. Architecture principles

1. Deliver Kappiyam's working farm application first. Commercial SaaS onboarding, subscriptions and platform administration are out of scope.
2. Keep farm-specific configuration and records out of application code.
3. Preserve stable identifiers and explicit relationships so data can move to PostgreSQL without changing business meaning.
4. Treat plans, assignments, observations, execution, stock movements and financial postings as distinct records.
5. No private farm data through public JSONP or unauthenticated endpoints.
6. Do not expose multi-user access until server-side identity and permission checks are implemented and tested.
7. Use additive, versioned schema migrations. Never clear or rewrite operational history as part of a migration.

## 2. Initial deployment topology

| Layer | Initial component | Responsibility |
|---|---|---|
| User interface | Apps Script HTML Service (native app) | Responsive role-specific workspace and direct server calls |
| Source control | GitHub | Versioned frontend, backend and migration source |
| Application services | Google Apps Script V8 | Validation, business rules, access checks, orchestration and scheduled jobs |
| Structured records | Google Sheets | Initial operational store; subject to concurrency and integrity validation |
| Attachments | Google Drive | Photos, documents and voice attachments with controlled access |
| Release automation | GitHub Actions + clasp | Approval-gated source upload; separate approval-gated deployment |

The GitHub Pages shell remains a diagnostic/static surface. The native HTML Service app is the intended operational UI because it can call Apps Script directly. JSONP is restricted to public health/benchmark diagnostics.

## 3. Identity and access boundary

- The current Apps Script deployment is configured to execute as the deploying user and allow access to **MYSELF**. Keep this owner-only boundary during development.
- This deployment restriction is not a substitute for the future application authorisation model.
- Before enabling additional users, implement verified identity resolution, user activation, role assignments, farm/operational-area scope checks and backend enforcement on every read/write service.
- Do not assume `Session.getActiveUser().getEmail()` is always populated. Test identity behaviour under the exact deployment mode before designing account linking.
- Shared-device PIN/sign-in and fast user switching must preserve individual actor attribution; never treat a shared device as a shared identity.
- UI visibility is not an authorisation control.

## 4. Data model boundaries

The current Sheets schema is a bootstrap only. Extend it by domain, keeping stable IDs and header-name-based access:

- Organisation and farm configuration: organisation, organisation users, farms, farm memberships and farm settings.
- Farm geography: fields, cultivation plots and infrastructure are distinct. Kappiyam's 31 cultivation plots are Field A (A1–A9), Field B (B1–B20) and Field C (C1–C2). Paths, ponds, buildings and utilities are not plots.
- Production: crop and variety masters, planting campaigns, plot-level crop cycles and linked intercrop cycles.
- Execution: calendar events, tasks, assignments, actual execution, attendance and worker participation are separate records.
- Field operations: scouting observations, irrigation runs/valve operations, applications and fertigation.
- Inventory: item masters, batches/lots, receipts, issues, transfers, returns, wastage, counts and adjustments.
- Harvest and sales: harvest source contributions, grades, disposition, produce lots, orders, fulfilment, dispatch, invoices and payments.
- Finance and assets: source transactions, cost allocations, wage transactions, asset register and maintenance.

Do not encode a crop, field, plot, unit or role as a hard-coded UI-only constant. Use configured master records.

## 5. Write safety and audit

Every state-changing service must:
1. Validate caller identity and scope on the server.
2. Validate required fields, types, units, references and allowed state transitions.
3. Use a script lock for critical Sheets writes where concurrent execution could corrupt a transaction.
4. Accept a client-generated idempotency key for retryable critical writes and return the original result for a duplicate request.
5. Write business records and audit metadata with a recoverable failure strategy. Sheets does not provide relational transactions; multi-row operations must not pretend otherwise.
6. Record actor, timestamp, action, entity, scope, reason and outcome; include before/after values where appropriate.
7. Correct posted operational/financial records through reversal or adjustment, not normal permanent deletion.

A lock alone does not make a multi-sheet write atomic. Critical workflows require explicit write ordering, status markers, retry/reconciliation and failure tests.

## 6. API conventions

- Native UI calls named server functions through `google.script.run`.
- Keep public `doGet` health probes limited to non-sensitive diagnostics.
- Do not return spreadsheet objects, raw sheet rows or unrestricted Drive URLs to the browser.
- Use small domain services and explicit response envelopes: `{ ok, data, error, requestId }`.
- Return actionable validation errors without exposing stack traces, credentials or internal sheet details.
- All date/time handling uses the farm timezone (initial Kappiyam setting: `Asia/Kolkata`); store timestamps consistently and preserve local operational dates.

## 7. Backup, export and migration

- Establish independent automated backups and a documented restore procedure before routine operational use.
- Test restore against a separate copy; never test recovery against the live development or production database.
- Exports must preserve stable IDs, relationships, units, timestamps and a data dictionary.
- Keep schema migrations additive and versioned; test against a database copy before applying to the active database.
- Evaluate PostgreSQL migration only against measured Sheets concurrency, capacity, runtime, reliability or recovery limits—not merely because it is available.

## 8. Release environments

- `foundation/bootstrap` is the development branch.
- The existing Apps Script deployment and production data remain untouched.
- Source upload and deployment are separate workflows. Source upload updates Apps Script HEAD only; deployment promotes a version to the existing deployment ID.
- Never run the deployment workflow without explicit owner approval.
- Test schema changes and source compatibility before any production promotion.

## 9. Phase 1 implementation order

1. Native application shell and navigation.
2. Owner-only development access boundary and identity/permission design gate.
3. Organisation/farm setup preview, followed by explicit idempotent setup action.
4. Farm, field, plot and infrastructure masters.
5. Crop, variety, unit, worker, supplier, customer, inventory-item and asset masters.
6. Audit foundation and controlled correction patterns.
7. Export and independent backup/restore baseline.

## 10. Release gates

A module is not complete merely because its screen renders. It must include:
- documented user workflow and permissions;
- validated server-side operations;
- stable IDs and relationship integrity;
- duplicate/retry and failure handling for critical writes;
- audit coverage;
- representative test evidence;
- known limitations and acceptance review.

Offline capture, multi-user access, voice workflows and WhatsApp notifications remain gated until their security, identity, retry, consent and reliability designs are implemented.
