# FarmERP build status

Last updated: 2026-11-16

## Working build

- Repository: `Kappiyam/Farm-`
- Active implementation branch: `feature/farmerp-complete-build`
- Current branch HEAD: `4e6ea32f995b32a3e04956d3a8b46ff6653aa5ab` at the time of this update.
- Canonical Apps Script schema: `1.0.3`, with 83 tables.
- Application service version: `1.0.0`.
- Target Apps Script project remains the existing Kappiyam project; no replacement project created.
- Existing production deployment has not been changed.

## Product scope

The target is the Kappiyam-specific multi-role farm management application described in the Kappiyam Farm Management Web Application PSD. The product scope includes owner, manager, team-leader, field-worker, irrigation, store/stock, harvest/packhouse, sales/accounts and read-only advisor/auditor workspaces. Commercial multi-tenant SaaS, subscription billing, the customer-facing e-commerce replacement, full agronomy knowledge-library population/AI diagnosis, advanced weather/IoT and statutory accounting remain outside the initial implementation.

The role model is a product requirement. The current `MYSELF` Apps Script manifest remains a deployment safety boundary until server-side identity, role and farm-scope enforcement is complete; it is not the intended user model or a completed worker release.

## Implemented and verified in the feature branch

1. Additive schema migration preview/install for 83 operational tables, stable primary keys, relation checks and unique-field validation.
2. Farm structure and master-data tables for organizations, farms, sites, fields, plots, beds, infrastructure, crops, varieties, units, people, suppliers, customers, items and assets.
3. Crop-cycle planning, configurable task templates, crop-task generation and preview.
4. Demand-to-production planning that keeps confirmed demand, forecasts, available produce, established crop supply, loss assumptions and production readiness distinct.
5. Task board, assignments, measured execution, task status history and workforce membership/contribution checks.
6. Daily Work Planner combining scheduled tasks, scouting follow-ups, confirmed-order harvest gaps and attendance availability. Day plans support draft, publish, defer, split and end-of-day close-out with change history.
7. Procurement receiving, stock-lot issue, harvest finalisation, produce-lot movements, sales fulfilment, invoicing, customer payments and workflow-integrity reporting.
8. Calendar recurrence, single-occurrence overrides and creation of follow-up tasks from calendar events.
9. Idempotency, locking and mocked regression coverage for major multi-sheet operations, duplicate request replay, validation rejections and reconciliation checks.
10. Kappiyam first-run farm profile preview and idempotent installer exposed in Farm Structure:
    - Organization: Kappiyam Organic Farm.
    - Farm: Kappiyam Organic Farm.
    - Site: Madampatti.
    - Field A, Field B and Field C.
    - 31 plot records: A1–A9, B1–B20, C1–C2.
    - Field B internal pathway as separate infrastructure.
    - Unknown measured plot areas, soil values, irrigation zones and physical valve labels are intentionally left for verified configuration; the installer does not invent them.
11. Daily Work Planner now has mobile cards for scheduled tasks, confirmed-order harvest requirements and saved plan items. Desktop and mobile task-selection controls stay synchronised.
12. GitHub Actions static and mocked-workflow checks pass on the above feature branch. Most recent recorded runs:
    - `43801063816` — Kappiyam setup UI contract checks: success.
    - `43800986654` — Kappiyam profile setup and replay-safety workflow tests: success.
    - `43800402943` — Daily planner mobile-control regression checks: success.

## Remaining release-critical work

1. **Identity and authorization:** user login/session management, secure shared-device switching, role permission resolution and farm/functional-scope enforcement are not complete. All reads, writes, reports, exports and workflow endpoints must be protected on the server before enabling worker access. Do not change `MYSELF` until this is tested.
2. **Actual Google Sheets integration:** current CI uses mocked Spreadsheet services. The full schema migration and operational workflows have not yet been proven on a disposable real Google Sheet under Apps Script V8.
3. **End-to-end field/UI audit:** complete the argument, return-shape, validation and field-level workflow audit for every module, including role-specific visibility and mobile behaviour.
4. **Translations:** English, Tamil and Hindi choices exist; complete per-user translation coverage for every screen, form, validation message and worker flow.
5. **Attachments and voice:** Attachments metadata exists; Drive binary upload, secure retrieval and voice capture/transcription confirmation are not complete.
6. **Offline:** no offline capture claim is made until local queue, pending/synced/failed states, retry and conflict handling are implemented and verified.
7. **Recovery and operations:** expand data exports, implement and test restore (not just backup-copy creation), independent backup scheduling, monitoring, Apps Script quota/runtime and concurrency tests, recovery and rollback procedures.
8. **Release automation:** existing clasp source-upload and deployment workflows remain restricted to `foundation/bootstrap`. The feature branch has not been pushed to the Apps Script project or deployed to the existing web app.

## Current test boundary

Passing CI verifies JavaScript syntax, frontend/backend API contracts, schema contracts and selected business-workflow invariants with mocked Sheets services. It does not prove the Apps Script runtime, real Google Sheets behaviour, Drive permissions, domain routing, live authentication or user acceptance.

Do not test destructive workflows against live farm data. Use a disposable spreadsheet and preserve a backup before migration tests. Do not promote the existing production deployment until the release-critical checks and owner approval are complete.
