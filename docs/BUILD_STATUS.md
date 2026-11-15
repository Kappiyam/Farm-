# FarmERP build status

Last updated: 2026-11-15

## Working branch

- Current canonical schema version: `1.0.2` (81 tables).
- Current app version label: `0.4.0` (not yet a release version).

- Branch: `feature/farmerp-complete-build`
- Base: `foundation/bootstrap`
- Latest branch commit: `c76baa1` (task execution contribution validation and regression tests).
- The base branch is preserved. Do not upload this feature branch to the live Apps Script project before integration review and explicit deployment approval.

## Confirmed requirements

- Google Apps Script V8 backend and bound Google Sheets database.
- HTML/CSS/JavaScript frontend using Apps Script HTML Service and `google.script.run`.
- English, Tamil and Hindi UI.
- Multi-organisation / multi-farm-capable data model with server-side scope enforcement before worker access.
- Farm-specific settings, responsive desktop/mobile UI.
- Planned tasks, assignments and actual execution remain distinct.
- Append-only operational/financial transaction history and traceability.
- Crop Health and Agronomy Knowledge Library remains a separate workstream; ERP only needs integration points.
- Existing Apps Script project remains the target. Do not create a replacement project.
- Current deployment remains owner-only (`MYSELF`) until authentication and permissions are implemented and tested.

## Implemented

1. Canonical schema version `1.0.2` with 81 defined tables, read-only migration preview and additive schema installation.
2. Bootstrap, generic CRUD/list/archive/CSV, dashboard, task board, task status history, assignment, execution and crop-task planning services.
3. Procurement receipt, harvest finalisation, produce-lot fulfilment, invoicing, customer payment, production-gap, reporting and calendar services.
4. GitHub Actions syntax and contract workflow.
5. Shared ScriptLock wrapper for critical multi-sheet workflows: procurement, harvest, fulfilment, invoicing, customer payments, task assignment/execution/status, ledger posting, archive, crop-task generation, calendar mutations, stock-lot issue, and task creation from observations/calendar events.
14. Extended idempotency records with in-progress/completed/failed states. Critical workflows now write a start marker before mutation, mark success after completion, allow a corrected retry when validation failed before any data write, and block blind retries after a partial write or interrupted execution. Request keys are bound to the workflow action.
15. Added a read-only workflow integrity report to Reports & Analytics. It checks procurement receipt postings, stock-lot receipt/issue balances, harvest-to-lot links, fulfilment-to-dispatch movements, missing produce-lot references, produce-lot balances, invoice totals and recorded customer payments; it reports exceptions without auto-correcting data.
6. Cumulative batch validation for repeated procurement lines, sales order lines and produce lots before writes.
7. Task status transition validation, including no-op handling for repeated identical status updates.
10. Generic saves reject unknown fields and unknown caller-supplied primary keys; customer payments validate date, method, invoice state and farm payment-account scope. Direct posting is blocked for Payments, InventoryTransactions and TaskExecution; remaining FinanceEntries/WageTransactions/Attendance postings have required-field and positive-amount checks.
11. Added an Attachments metadata table and Scouting workspace entry. Binary upload/storage integration is not yet implemented.
17. Added a locked, idempotent stock-lot issue workflow and a StockLots UI action. It checks available quantity and farm/plot scope; generic direct StockLots edits are blocked.
18. Added farm-member validation for task assignment and task execution, including nonnegative quantity/duration, contribution percentages and an aggregate 100% contribution ceiling.
19. Added locked/idempotent task creation from scouting observations and calendar events.
20. Extended mocked workflow tests for harvest traceability, stock issue/replay/over-issue, cross-farm assignment/execution and stock destinations, calendar/observation task replay, missing product/lot references, invoice overpayment and stock-lot reconciliation.
13. Renamed legacy database setup routines as private reference functions; the current setup path is the canonical additive `erpPreviewSchemaMigration()` / `erpInstallSchema()` flow. CI guards against re-exposing the legacy setup functions.
12. Added `docs/SECURITY_MODEL.md` defining the owner-only posture and the required server-side authorization work before worker access.
16. Prepared `docs/ACCEPTANCE_TEST_PLAN.md` with disposable-spreadsheet scenarios, failure recovery, security checks and evidence requirements.
8. Contract audit: all 26 frontend API calls resolve and their argument counts fit backend signatures; all 77 UI table references and all 36 lookup-map fields resolve to canonical schema columns, with duplicate keys and stale mappings rejected by CI; 81 canonical tables are defined in schema version `1.0.2`, including the new Attachments metadata table exposed in the Scouting workspace. CI also guards the Apps Script manifest to keep deployment owner-only.
9. GitHub Actions passed on latest branch commit `c76baa1` (run `43701387546`, 2026-11-15): syntax/contract checks plus mocked Sheets-service workflow tests. This is not a live Apps Script or real Google Sheets integration test.

## Known limitations and remaining work

1. Google Sheets does not provide multi-sheet atomic transactions. ScriptLock serialises concurrent execution. Write-ahead idempotency markers prevent blind replay after an interrupted or failed request, but a service interruption after the first write can still leave partial records that require manual reconciliation. Automated reconciliation/compensation is still required.
2. Frontend idempotency-key coverage still needs a final audit across every critical write. Generic saves, calendar creation, stock issues, task creation, and archive actions now send request keys; remaining write paths still require review.
3. Server-side role, user and farm-membership authorization is not complete. Keep deployment access set to `MYSELF`; do not expose to workers or public users.
4. A full argument/return-shape and field-level UI/API audit remains incomplete; current contract checks are stronger but not a substitute for full runtime validation.
5. Mocked tests now cover payment replay/overpayment detection, task assignment/execution membership and contribution limits, calendar recurrence and task replay, stock issue, archive replay, harvest traceability, missing references and partial-write blocking. These tests do not prove Apps Script runtime or Google Sheets behaviour.
6. Run Apps Script integration tests on a disposable spreadsheet. No live farm spreadsheet may be used for destructive tests.
7. Verify first-run setup, English/Tamil/Hindi coverage, file/photo attachment handling and voice-capture integration points.
8. Complete import/export, backup/restore, quota/performance checks, observability and a documented recovery procedure.
9. Prepare and review the source upload/deployment process. Do not run the existing source-upload workflow against this feature branch until its branch protections are deliberately reviewed.

## Release gate

Do not declare the application setup-ready until:
- static syntax and expanded contract checks pass;
- API payloads, returned data and all UI tables/fields align;
- core workflow tests pass, including duplicate/retry and partial-failure scenarios;
- user identity, roles and farm-level authorization are enforced server-side, or deployment remains explicitly restricted to the owner for a limited owner-only pilot;
- schema preview has no primary-key conflicts;
- the build is tested against a disposable spreadsheet;
- backup, restore, reconciliation and rollback steps are documented;
- the owner approves deployment to the existing Apps Script project.

## Recovery instructions

Read this file, inspect the latest branch commit and CI result, then continue with the first unfinished release-gate item. Make small, recoverable commits. Never rewrite the project in one large change.
