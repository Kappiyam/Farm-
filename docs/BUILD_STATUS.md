# FarmERP build status

Last updated: 2026-11-15

## Working branch

- Branch: `feature/farmerp-complete-build`
- Base: `foundation/bootstrap`
- Latest known work package: `1075f1a` (farm-member checks for task assignment and execution passing)
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

1. Canonical schema with 80 defined tables, read-only migration preview and additive schema installation.
2. Bootstrap, generic CRUD/list/archive/CSV, dashboard, task board, task status history, assignment, execution and crop-task planning services.
3. Procurement receipt, harvest finalisation, produce-lot fulfilment, invoicing, customer payment, production-gap, reporting and calendar services.
4. GitHub Actions syntax and contract workflow.
5. Shared ScriptLock wrapper for critical multi-sheet workflows: procurement, harvest, fulfilment, invoicing, customer payments, task assignment/execution/status, ledger posting, archive, crop-task generation and calendar mutations.
14. Extended idempotency records with in-progress/completed/failed states. Critical workflows now write a start marker before mutation, mark success after completion, allow a corrected retry when validation failed before any data write, and block blind retries after a partial write or interrupted execution. Request keys are bound to the workflow action.
15. Added a read-only workflow integrity report to Reports & Analytics. It checks procurement receipt postings, harvest-to-lot links, fulfilment-to-dispatch movements, produce-lot balances and invoice totals; it reports exceptions without auto-correcting data.
6. Cumulative batch validation for repeated procurement lines, sales order lines and produce lots before writes.
7. Task status transition validation, including no-op handling for repeated identical status updates.
10. Generic saves reject unknown fields and unknown caller-supplied primary keys; customer payments validate date, method, invoice state and farm payment-account scope. Direct posting is blocked for Payments, InventoryTransactions and TaskExecution; remaining FinanceEntries/WageTransactions/Attendance postings have required-field and positive-amount checks.
11. Added an Attachments metadata table and Scouting workspace entry. Binary upload/storage integration is not yet implemented.
13. Renamed legacy database setup routines as private reference functions; the current setup path is the canonical additive `erpPreviewSchemaMigration()` / `erpInstallSchema()` flow. CI guards against re-exposing the legacy setup functions.
12. Added `docs/SECURITY_MODEL.md` defining the owner-only posture and the required server-side authorization work before worker access.
8. Contract audit: all 26 frontend API calls resolve and their argument counts fit backend signatures; all 77 UI table references and all 43 lookup-map entries resolve to the canonical schema; 81 canonical tables are defined, including the new Attachments metadata table exposed in the Scouting workspace. CI also guards the Apps Script manifest to keep deployment owner-only. Latest workflow checks passed on `20fad92`; the current branch head contains documentation-only changes after that passing run.
9. GitHub Actions passed on commit `b4a4f06`: syntax/contract checks plus mocked Sheets-service workflow tests. The tests cover cumulative duplicate procurement lines, same-lot fulfilment aggregation, idempotent receipt/fulfilment/invoice/payment replay, task status transitions and duplicate-safe crop-task generation. This is a mocked runtime, not a live Apps Script or real Google Sheets integration test. This is a mocked runtime, not a live Apps Script or real Google Sheets integration test.

## Known limitations and remaining work

1. Google Sheets does not provide multi-sheet atomic transactions. ScriptLock serialises concurrent execution. Write-ahead idempotency markers prevent blind replay after an interrupted or failed request, but a service interruption after the first write can still leave partial records that require manual reconciliation. Automated reconciliation/compensation is still required.
2. Frontend does not yet consistently pass stable idempotency request keys for every critical write. Verify and add request keys at the UI boundary.
3. Server-side role, user and farm-membership authorization is not complete. Keep deployment access set to `MYSELF`; do not expose to workers or public users.
4. Full argument/return-shape and field-level UI/API audit remains incomplete.
5. Extend functional tests for payment balance races, task assignment/execution and calendar recurrence. The mocked suite now injects a partial write and verifies that the failed request key blocks a blind retry; it also verifies that the integrity report detects an orphan fulfilment movement and that additive schema migration creates missing tabs/appends missing columns without losing existing row data. Latest GitHub Actions run on `6e7fd05` passed both contract and workflow invariant suites, including validation-only retry and partial-write blocking tests.
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
