# Farm Management Application — Development Audit

**Audit date:** 14 November 2026  
**Baseline:** Standard Farm Management Application PSD v1.2 (12 November 2026)  
**Repository:** `Kappiyam/Farm-`  
**Audited branch:** `foundation/bootstrap`  
**Production:** Existing Apps Script deployment is not modified by this audit.

## Executive finding

The repository is a working technical proof of connectivity and deployment automation, not yet a functional farm-management application. The current code proves that GitHub Actions can upload Apps Script source, the Apps Script project is bound to the development spreadsheet, and a native HTML Service page can call server functions. It does not yet implement the operational modules in PSD v1.2.

## Repository and release state

- Default branch: `main`; development branch: `foundation/bootstrap`.
- Branch comparison at audit: development is **35 commits ahead and 3 behind** main; histories are diverged. Do not merge blindly or change the default branch.
- Existing source-only upload workflow uses clasp and the protected `apps-script-production` environment. It updates Apps Script HEAD, not the deployed web-app version.
- A separate workflow promotes uploaded Apps Script source to the existing deployment ID. It must remain approval-gated and must not be run for development testing.
- The Apps Script manifest is V8, timezone `Asia/Kolkata`, execute-as deploying user, access `MYSELF`.
- GitHub Pages currently serves the static root shell. The Apps Script native app is separately served through `?mode=app`.

## Implemented today

1. Initial Google Sheets schema setup and schema metadata.
2. Additive multi-farm foundation migration: Organizations, OrganizationUsers, FarmMemberships, FarmSettings, plus additional Farms columns.
3. Read-only preview for proposed Kappiyam organisation and Madampatti farm records.
4. Health/diagnostic endpoints and a native Apps Script HTML Service shell.
5. GitHub Actions workflows for Apps Script access verification, source upload and controlled deployment.

The development database has been migrated to schema 0.2.0. The preview confirms that the KAPPIYAM and MADAMPATTI codes are absent. The organisation and farm records have **not** yet been created.

## Not implemented

- Authentication and server-enforced user/role/farm permissions.
- Persistent organisation/farm onboarding and configuration UI.
- Farm/site/field/plot/infrastructure master-data CRUD.
- Crop/variety profiles, crop cycles, propagation and production planning.
- Tasks, templates, assignments, actual execution and workforce records.
- Scouting, irrigation, fertigation, soil and climate operations.
- Procurement, inventory lots/batches, stock movements and reconciliation.
- Harvest, grading, produce lots, storage, dispatch and traceability.
- Customers, products, orders, fulfilment, invoices, payments and returns.
- Finance, cash/bank, expenses, wage settlement, cost attribution and profitability.
- Asset register and maintenance.
- Operational dashboards, reports, notifications, audit trails for business transactions, backup/restore, import/export and offline sync.

The existing static frontend has only Overview and Farm Setup placeholder views. Its navigation labels for Operations and Reports are disabled. The native Apps Script page has Overview and Farm Setup preview screens only.

## Critical risks / design gates

1. **Access control:** Apps Script is currently configured for owner-only access. This is appropriate for the development proof. Do not broaden access until identity, session handling and server-side authorisation are implemented and tested. Hiding UI controls is not security.
2. **JSONP:** Existing JSONP endpoints are diagnostics only. Never use JSONP for private farm records, authentication, or write actions.
3. **Data integrity:** Google Sheets is not a transactional relational database. All writes need validation, locking where appropriate, idempotency keys for retryable transactions, audit records and reconciliation. Critical multi-row workflows require explicit failure/recovery design.
4. **Schema coverage:** Current schema is a starter set, not a complete representation of PSD v1.2. Extend through versioned, additive migrations; do not casually rename/delete tabs or rewrite historical data.
5. **Offline:** Do not claim offline capability until the supported action set, local queue, idempotency, server acknowledgement and conflict resolution are implemented.
6. **Production release:** Keep current production deployment and database separate from development. Development source uploads are not production releases.
7. **Branch divergence:** Reconcile the three commits on main deliberately before any future merge; do not merge branches wholesale.

## Recommended build sequence

### Foundation release
- Native HTML Service application shell with responsive navigation and consistent module layout.
- Organisation and farm setup records, with guarded/idempotent initial setup.
- Farm structure: farms, sites/fields/plots/production units and infrastructure.
- Master data: crops, varieties, units, people, suppliers, customers, items and assets.
- Authentication/authorisation design and server-side permission enforcement before multi-user exposure.
- Audit foundation, settings, schema migration framework, export/backup baseline.

### Production and daily operations
- Demand and production planning.
- Crop profiles, crop cycles, propagation and planting.
- Task templates, scheduling, assignments and actual execution.
- Workforce, attendance and participation.
- Scouting, irrigation and field operations.

### Inputs and inventory
- Procurement, receiving, stock lots/batches, storage, transfer, issue, return, farm-made batches, consumption and reconciliation.

### Harvest and sales
- Harvest sessions, grades, produce lots, post-harvest, storage, dispatch, customers, orders, fulfilment, invoicing, payments and returns.

### Finance, reports and stabilisation
- Income/expenses, cash/bank, wage settlements, direct/allocated/estimated costs, profitability and reports.
- Notifications, offline capability (only after design), monitoring, tested backup/restore, performance and training.

## Working rules

- PSD v1.2 is the functional baseline; farm-specific values belong in a separate Kappiyam configuration profile.
- Keep application logic modular and data identifiers portable so PostgreSQL migration remains possible.
- Deliver coherent module groups, not isolated button demos.
- Each module review must include implemented workflows, known gaps, test evidence and acceptance criteria.
- Never promote to production without explicit owner approval.
