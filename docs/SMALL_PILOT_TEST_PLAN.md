# FarmERP small owner-only pilot test

## Purpose and safety boundary

This is a controlled acceptance test of the feature branch against a disposable Google Spreadsheet. It is not a worker-access or production release.

- Never point the test project at the live farm database.
- Do not deploy the feature branch to the existing live Apps Script project.
- Keep the test web app restricted to the deploying owner (MYSELF).
- Use fictional records only. Do not copy personal, supplier, customer, employee, financial or crop-production data into the test sheet.
- Keep the original disposable spreadsheet backup unchanged until all tests pass.

## Prepare the isolated test environment

1. In Google Drive, create a new, blank Google Spreadsheet and name it FarmERP - DISPOSABLE TEST - YYYYMMDD. Do not copy the live farm database or its records.
2. Record the new spreadsheet ID. Confirm it contains no operational data before continuing.
3. Create/use a separate Apps Script project bound to this disposable spreadsheet. Do not change the live Apps Script project.
4. Bring in the reviewed source from branch feature/farmerp-complete-build. Confirm the manifest still has executeAs: USER_DEPLOYING and access: MYSELF.
5. Before installing schema, use File → Make a copy again to create a clean pre-migration backup. Record both spreadsheet IDs in the test log.
6. Run erpPreviewSchemaMigration(). Review the output. Stop if any primary-key mismatch is reported.
7. Run erpInstallSchema() once. Run the preview again; it should report no missing tabs, missing columns or primary-key mismatches.
8. Deploy a test web app from the isolated project, executing as the deploying user and accessible only to yourself. Do not edit or redeploy the live app.

## Small test sequence

Use fictional names and small quantities. Stop at the first failure; capture the error and the relevant record IDs.

| # | Test | Pass condition |
|---|---|---|
| 1 | Open the test web app; refresh and switch English/Tamil/Hindi | Dashboard loads; no Apps Script connection or console errors. Translation is partial at this stage; verify language picker and translated core controls only. |
| 2 | Create one test farm, site, field and plot | Records save and appear in the correct lists. |
| 3 | Create one crop cycle and one task template; generate tasks twice | No duplicate tasks; task status change appears in board/history. |
| 4 | Create one observation and a follow-up task | Observation remains intact; one linked follow-up task is created. |
| 5 | Create one supplier, inventory item and procurement order with one line | Receive a small quantity; stock lot and receipt movement appear once. |
| 6 | Issue part of the test stock lot to the test plot | Available balance decreases once; over-issue and cross-farm plot are rejected. |
| 7 | Create a harvest session and finalise one test line | Harvest line and produce lot are created and traceable. |
| 8 | Create one customer, product and sales order; fulfil from the produce lot | Fulfilment and dispatch movement are created once; available produce balance decreases. |
| 9 | Create an invoice and record a partial payment | Invoice totals and balance are correct; replay with the same request key does not duplicate payment. |
| 10 | Create a recurring calendar event; cancel one occurrence; create a task from another occurrence | Only the selected occurrence is changed; task creation is duplicate-safe. |
| 11 | Run Workflow Integrity report | Clean test workflows show no unexplained issues. Any deliberately injected test mismatch is detected; no auto-repair occurs. |
| 12 | Export a test table to CSV; refresh and reopen | CSV opens and records remain present. |

## Recovery and evidence

- If a test fails after writes, do not repeat it with a new request key until the affected records and integrity report have been reviewed.
- For a clean restart, close the test web app and restore by using the untouched pre-migration backup as the test database, or create a fresh disposable copy. Do not try to reverse schema changes manually.
- Record test project ID, test deployment URL/version, spreadsheet ID, backup ID, Git commit SHA, test date, pass/fail per row, errors and integrity report findings.
- Delete the disposable spreadsheet and test Apps Script project only after evidence is saved and the owner confirms they are no longer needed.

## Not covered by this pilot

- Worker access, multi-user roles and farm-level authorisation. The pilot is owner-only.
- Full Tamil/Hindi translation coverage.
- Binary photo/file upload and retrieval.
- Automated recovery/compensation for a partial multi-sheet write.
- Production performance, quota/load testing and live deployment.

A successful small pilot is evidence for an owner-only pilot candidate only. It is not approval for worker access or production deployment.