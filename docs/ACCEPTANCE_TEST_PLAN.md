# FarmERP disposable-spreadsheet acceptance test plan

This plan is for a disposable Google Sheet only. Do not run these tests against the live farm database.

## Entry conditions

- Create a new, empty Google Sheet for testing.
- Bind/use the existing Apps Script project only after source integration review and owner approval.
- Keep the web app access restricted to the deploying owner.
- Create a copy of the disposable sheet before schema installation.
- Record the sheet ID and backup copy ID in the test log.

## Schema and setup

1. Run `erpPreviewSchemaMigration()`.
2. Confirm the preview reports the expected missing tabs/columns and no primary-key mismatches.
3. Run `erpInstallSchema()` once.
4. Run the preview again; it should report no missing tabs/columns and no mismatches.
5. Confirm the schema installer preserved all pre-existing test rows in a separate migration fixture.
6. Create one test organisation, one farm, one site, one field and one plot.

## Core operational scenarios

| Scenario | Action | Acceptance condition |
|---|---|---|
| Crop planning | Create crop cycle and task templates; generate tasks twice | No duplicate template tasks |
| Task assignment | Assign an active farm member and a farm team | Assignment rows are farm-scoped and replay-safe |
| Task execution | Record worker actuals twice using the same request key | One set of execution rows; task status updates correctly |
| Procurement | Receive multiple quantities against one order line | Received quantity is cumulative and cannot exceed ordered quantity |
| Inventory issue | Issue stock from a lot to a farm/plot use | Available quantity is reduced once; over-issue and cross-farm destination are rejected |
| Harvest | Finalise a harvest session | Harvest lines and traceable produce lots are created once |
| Fulfilment | Fulfil multiple order lines from the same produce lot | Aggregate lot availability is enforced; no over-dispatch |
| Invoicing | Create invoice from fulfilled quantities | Only uninvoiced fulfilled quantities are invoiced |
| Customer payment | Record payment and replay the same request | Payment is recorded once; overpayment and cross-farm accounts are rejected |
| Calendar | Expand recurrence, cancel one occurrence and override another | Only intended occurrences are changed |
| Integrity | Generate Workflow Integrity / Reconciliation report | No issues for clean workflows; injected mismatch is detected |

## Failure and recovery scenarios

1. Submit an invalid receipt/payment before any data write; correct the input and retry using the same request key. The retry should be allowed.
2. Inject a failure after the first data write. The request key should be marked failed and a blind retry should be blocked.
3. Run the integrity report and inspect the affected source records.
4. Verify that no automatic correction occurs.
5. Restore the disposable sheet from its backup and repeat after any code correction.

## Security checks

- Confirm a non-owner account cannot open the current owner-only web app.
- Do not change deployment access to anyone/domain during this test.
- Do not share the underlying database sheet with workers.
- Worker-access testing is a separate release gate after identity and farm-membership authorization is implemented.

## Final acceptance evidence

Record:
- Apps Script deployment version and timestamp.
- Schema version.
- Git commit SHA.
- Test spreadsheet and backup IDs.
- Pass/fail result for every scenario.
- Any integrity report exceptions.
- Apps Script execution errors and quota/time measurements.

The owner-only pilot is accepted only after all core scenarios pass on the disposable sheet, backup/restore is verified, and no unresolved integrity issues remain.
