# FarmERP security and deployment constraints

## Current deployment posture

The Apps Script manifest is intentionally configured as:

- Execute as: deploying user
- Access: only the deploying user (`MYSELF`)
- Runtime: V8
- Time zone: Asia/Kolkata

CI checks this manifest and fails if the web app is made broadly accessible before the authorization work is complete.

## What this currently protects

The current deployment is restricted to the deploying owner. It is not a worker-access release. The backend contains farm identifiers and membership tables, but the presence of those tables is not equivalent to authorization enforcement.

## Requirements before worker access

Do not change the manifest access setting until all of the following are implemented and tested:

1. Require a non-empty, verified Google account identity for every request. Reject requests where Apps Script cannot provide the active user's email.
2. Resolve the active email to exactly one active `Users` record.
3. Verify active `OrganizationUsers` and `FarmMemberships` records for the requested organisation and farm.
4. Resolve role permissions from `Roles.permissions_json` and enforce them server-side for every read, create, update, archive, export and workflow action.
5. Scope every list, dashboard, report, lookup and workflow source-record read to the user's permitted farms. Never rely on the browser's farm picker as an access control.
6. Test cross-farm denial, unauthorised table access, inactive users, revoked memberships, missing identity and privilege escalation.
7. Choose a deployment access mode compatible with the farm team's Google accounts and verify the Apps Script identity behaviour for those accounts.

## Operational safeguards

- Do not share the underlying database spreadsheet with workers merely to let them use the web app.
- Do not expose CSV export or generic CRUD to worker roles without permission checks.
- Keep audit history append-only.
- ScriptLock serialises Apps Script executions; it does not make a multi-sheet workflow atomic. A partial write can still occur after an Apps Script service failure.
- Before every production migration, create and verify a spreadsheet backup and run `erpPreviewSchemaMigration()`. Run `erpInstallSchema()` only after reviewing its read-only preview.
- Never run test or failure-injection scenarios against the live farm spreadsheet.

## Owner-only pilot versus worker release

An owner-only pilot can be considered separately from a worker-access release after the owner has reviewed the remaining pilot limitations and the disposable-spreadsheet integration tests pass. Worker access remains blocked until the complete server-side authorization requirements above are met.
