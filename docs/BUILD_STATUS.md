# FarmERP build status

Last updated: 2026-11-15 (continued development)

## Working branch

- Branch: `feature/farmerp-complete-build`
- Base: `foundation/bootstrap`
- Existing base branch is preserved; do not upload this feature branch to the live Apps Script project until integration review.

## Delivery method

Development is split into small, independently committed work packages. Each package must leave the branch in a recoverable state. A failed or timed-out session must resume from this file and the latest branch commit, not restart or overwrite previous work.

The user-facing acceptance cycle is consolidated: complete the integrated application, run static and workflow tests, prepare one launch checklist, then ask the farm owner for deployment approval and conduct farm-wide trial feedback.

## Confirmed requirements

- Google Apps Script V8 backend and bound Google Sheets database.
- HTML/CSS/JavaScript frontend using Apps Script HTML Service and `google.script.run`.
- English, Tamil and Hindi UI.
- Multi-organisation / multi-farm-capable data model.
- Farm-specific settings rather than hard-coded farm operations.
- Responsive use on desktop and mobile.
- Keep planned tasks, assignments and actual execution distinct.
- Preserve append-only operational/financial transaction history and traceability.
- Crop Health and Agronomy Knowledge Library is a separate workstream, not embedded in core ERP scope.
- Current Apps Script project remains the target project; do not create a replacement project.
- Live deployment access remains owner-only until authentication and permissions have been reviewed.

## Completed in this branch

1. Created `feature/farmerp-complete-build` from `foundation/bootstrap`.
2. Added canonical table definitions and read-only migration preview in `backend/ErpSchema.gs`.
3. Added additive schema migration function `erpInstallSchema()`; it appends missing columns and creates missing tabs, and refuses primary-key conflicts.
4. Added bootstrap, generic validated CRUD/list/archive/CSV, dashboard, task board, status history, assignment, execution and crop-task planning services in `backend/ErpApi.gs`.
5. Added procurement receipt, harvest finalisation, produce-lot fulfilment, invoicing, customer payment, production-gap, reporting and calendar services in `backend/ErpWorkflows.gs`.

## Current known gaps / next work packages

1. Initial static syntax validation now passes for Code.gs, ErpSchema.gs, ErpApi.gs, ErpWorkflows.gs and the App.html inline script. One malformed calendar schema line was found and corrected in a separate commit.
2. Initial API name check: all 26 distinct frontend API call names now resolve to backend functions. Full argument/return-shape and field-level contract audit is still pending.
3. GitHub Actions workflow is committed; a successful hosted CI run has not yet been confirmed.
3. Add transaction locks and stronger validation around multi-sheet workflows; add rollback/compensation strategy where Apps Script cannot provide atomic transactions.
4. Complete role/permission enforcement and establish a safe owner/worker authentication model before changing web-app access from MYSELF.
5. Improve first-run setup UX for organisation, farm, owner and role records.
6. Add file/photo handling, attachment metadata and voice-capture integration points.
7. Complete import/export, data backup/restore, observability and performance checks for Google Sheets quotas and scale.
8. Consolidate UI translations; verify that all screens and form labels are localised, not only navigation labels.
9. Run end-to-end test scenarios using a disposable test spreadsheet; never use live farm data for destructive tests.
10. Prepare source upload and deployment procedure. Existing source-upload workflow is branch-restricted; do not run it against this feature branch without changing and reviewing its safeguards.

## Release gate

Do not declare the application launch-ready until:
- all frontend API calls resolve to implemented backend functions;
- all UI tables exist in the canonical schema;
- static syntax/contract checks pass;
- core workflows pass repeatable test scenarios;
- permissions are enforced server-side;
- migration preview has no primary-key conflicts;
- the deployment has been tested against a disposable copy of the spreadsheet;
- backup and rollback steps are documented.

## Recovery instructions

On resumption, read this file, inspect the latest commits on this branch, run the contract checks, then continue with the first unfinished work package above. Never rewrite the entire project in one large change.
