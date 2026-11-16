# FarmERP isolated integration acceptance test

## Purpose and distinction

This is a controlled test of the current FarmERP feature branch against a disposable Google Spreadsheet. It is not the intended product access model.

The intended FarmERP product is multi-role: Owner, Farm Manager, Team Leader, Field Worker, Irrigation Operator, Storekeeper, Harvest/Packhouse, Sales/Accounts and Advisor/Auditor, with permissions scoped by farm and operational responsibility. The disposable test environment is temporarily restricted to its deploying user so that unfinished authorization cannot expose farm records. This temporary test restriction must not be mistaken for an owner-only product requirement.

## Safety boundary

- Never point the test project at the live farm database.
- Do not promote the feature branch to the existing production web-app deployment.
- Keep the disposable test web app restricted to the deploying user until the integration tests pass.
- Use fictional records only. Do not copy personal, supplier, customer, employee, financial or crop-production data into the test sheet.
- Keep the original disposable spreadsheet backup unchanged until all tests pass.

## Prepare the isolated test environment

1. Create a blank Google Spreadsheet named `FarmERP - DISPOSABLE TEST - YYYYMMDD`. Do not copy live farm records.
2. Record the spreadsheet ID and confirm that it contains no operational data.
3. Bind a disposable Apps Script test project to this spreadsheet, or use a disposable project/sheet pair prepared for integration testing. Do not change the active Kappiyam deployment or its database.
4. Upload the reviewed source from branch `feature/farmerp-complete-build` to the disposable test project. Confirm the manifest remains `executeAs: USER_DEPLOYING` and `access: MYSELF` for this isolated test.
5. Make a clean pre-migration copy and record its spreadsheet ID.
6. Run `erpPreviewSchemaMigration()`. Stop if any primary-key mismatch is reported.
7. Run `erpInstallSchema()` once, then rerun the preview. It should report no missing tabs, columns or primary-key mismatches.
8. Run the Reports → Database schema & data health report. Confirm all 83 canonical tables are detected, scan truncation is clearly reported, and the diagnostic does not alter any row.
9. Run the Farm Structure → Preview Kappiyam setup action. Verify the 38-record proposal: one organization, one farm, one site, three fields, 31 plots and one infrastructure item. Confirm preview is read-only.
10. Install the profile. Confirm Field A contains A1–A9, Field B contains B1–B20, Field C contains C1–C2, and Field B's 12-ft pathway is infrastructure rather than a cultivation plot. Run the installer again; it must create zero additional records.
11. Deploy a test web app from the isolated project, executing as the deploying user and accessible only to the test operator. Do not edit or redeploy the active Kappiyam app.

## Integration and acceptance sequence

Use fictional names and small quantities. Stop at the first failure; capture the error and relevant record IDs.

| # | Test | Pass condition |
|---|---|---|
| 1 | Open the test web app; refresh and switch English/Tamil/Hindi | Dashboard loads with no Apps Script connection or console errors. Record translation gaps; the language selector alone does not count as full translation acceptance. |
| 2 | Open Farm Structure | Kappiyam profile preview and setup state agree with the spreadsheet; the installer is replay-safe. |
| 3 | Create an additional fictional farm, site, field and plot | Records save and appear under the correct parent farm; no cross-farm relationships are accepted. |
| 4 | Create one crop cycle and task template; generate tasks twice | No duplicate tasks; task status changes appear in board/history. |
| 5 | Create one observation and a follow-up task | Observation remains intact; one linked follow-up task is created. |
| 6 | Create one supplier, inventory item and procurement order with one line | Receive a small quantity; stock lot and receipt movement appear once. |
| 7 | Issue part of the test stock lot to the test plot | Available balance decreases once; over-issue and cross-farm plot are rejected. |
| 8 | Create a harvest session and finalise one test line | Harvest line and produce lot are created and traceable. |
| 9 | Create one customer, product and sales order; fulfil from the produce lot | Fulfilment and dispatch movement are created once; available produce balance decreases. |
| 10 | Create an invoice and record a partial payment | Invoice totals and balance are correct; replay with the same request key does not duplicate payment. |
| 11 | Create a recurring calendar event; cancel one occurrence; create a task from another occurrence | Only the selected occurrence is changed; task creation is duplicate-safe. |
| 12 | Create a Daily Work Plan, select tasks, save draft, publish, defer/split an item and close the plan | Lifecycle state and change history are correct; repeated requests do not duplicate items or tasks. |
| 13 | Use Daily Work Planner on a narrow/mobile viewport | Task inclusion, assignment, harvest-task creation, defer and split remain visible and usable as mobile cards; desktop and mobile task selection stays in sync. |
| 14 | Run Workflow Integrity and Database Health reports | Deliberately injected test mismatches are detected; diagnostics remain read-only; no automatic repairs occur. |
| 15 | Export a test table to CSV; refresh and reopen | CSV opens and saved records remain present. |

## Recovery and evidence

- If a test fails after writes, do not repeat it with a new request key until the affected records and integrity report have been reviewed.
- For a clean restart, restore the test spreadsheet from the untouched pre-migration backup or create a fresh disposable spreadsheet. Do not manually reverse schema changes.
- Record test project ID, test deployment URL/version, spreadsheet ID, backup ID, Git commit SHA, test date, pass/fail per row, errors and report findings.
- Delete the disposable spreadsheet and test Apps Script project only after evidence is saved and the owner confirms they are no longer needed.

## Not yet accepted by this test

- Multi-user sign-in and server-enforced role/farm authorization across every endpoint.
- Full Tamil/Hindi translation coverage.
- Binary photo/file upload and retrieval through Drive.
- Offline queueing and conflict resolution.
- Automated recovery/compensation for interrupted multi-sheet transactions.
- Production quota, performance, concurrency, restore and user-acceptance tests.

A passing disposable integration test is evidence for the release review. It does not, by itself, authorize broad worker access or production promotion.
