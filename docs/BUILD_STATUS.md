# FarmERP build status

Last updated: 2026-11-15

## Working branch

- Branch: `feature/farmerp-complete-build`
- Base: `foundation/bootstrap`
- Latest known work package: `9b2a058` (API write serialisation and task-state validation)
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
5. Shared ScriptLock wrapper for critical multi-sheet workflows: procurement, harvest, fulfilment, invoicing, customer payments, task assignment/execution/status, ledger posting and archive.
6. Cumulative batch validation for repeated procurement lines, sales order lines and produce lots before writes.
7. Task status transition validation.
8. Initial contract audit: all 26 frontend API call names resolve; all 77 UI table references are present in the canonical schema; 80 canonical tables are defined.
9. GitHub Actions passed on commits `d56126a` and `9b2a058`. These are static syntax/contract checks, not live Apps Script runtime tests.

## Known limitations and remaining work

1. Google Sheets does not provide multi-sheet atomic transactions. ScriptLock serialises concurrent execution and idempotency keys prevent replay when supplied, but a service interruption after the first write can still leave a partial transaction. A reconciliation/compensation strategy and failure-injection tests are still required.
2. Frontend does not yet consistently pass stable idempotency request keys for every critical write. Verify and add request keys at the UI boundary.
3. Server-side role, user and farm-membership authorization is not complete. Keep deployment access set to `MYSELF`; do not expose to workers or public users.
4. Full argument/return-shape and field-level UI/API audit remains incomplete.
5. Add functional tests for duplicate receipt lines, same-lot multi-line fulfilment, repeated invoice creation, payment balance races, partial write recovery and calendar recurrence.
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
