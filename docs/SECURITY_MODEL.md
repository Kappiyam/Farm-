# FarmERP identity, roles and access-control implementation

## Product target

FarmERP is intended for multiple named users with role- and farm-scoped access. The supported role families are:

- Owner and Farm Manager
- Team Leader and Field Worker
- Irrigation Operator
- Storekeeper / Inventory
- Harvest and Packhouse
- Sales and Accounts
- Advisor / Auditor (read-only or explicitly approved permissions)

A user may hold more than one role. Permissions must be enforced by the server for each action and record scope. Hiding a screen or button is not authorization.

## Current development boundary

The current Apps Script manifest remains:

- Runtime: V8
- Execute as: deploying user
- Access: deploying user only (`MYSELF`)
- Time zone: Asia/Kolkata

This is a temporary development restriction because full identity and authorization enforcement is not complete. It is not the desired product access model, not a definition of the pilot product, and not a reason to omit the worker-facing workflows from the implementation.

CI intentionally prevents changing the manifest to broad access before the required controls have tests.

## Required server-side identity model

The canonical tables include `Users`, `Roles`, `UserRoles`, `OrganizationUsers` and `FarmMemberships`. Their presence does not itself enforce authorization.

Before opening the web app to multiple users:

1. Establish a reliable sign-in/session flow suitable for the farm's shared devices. Every operation must have an individual actor identity; a shared device must never become a shared user.
2. Resolve the signed-in principal to exactly one active `Users` record. Reject unknown, inactive, ambiguous or expired identities.
3. Verify active organization membership and farm membership for the requested context.
4. Resolve permissions from the assigned role definitions and any explicit scope restrictions.
5. Apply server-side permission checks to every list, search, lookup, dashboard, report, export, create, update, archive, ledger posting and domain workflow endpoint.
6. Enforce row-level farm scope and parent-derived scope for child tables without a redundant `farm_id`.
7. Record the authenticated actor on audit events, attendance, task assignment/execution, irrigation, stock movements, harvest, payments and financial entries.
8. Test revoked membership, inactive user, cross-farm access, unauthorised table/action, privilege escalation, session expiry/replay, shared-device user switching and failed sign-in throttling.
9. Select the Apps Script deployment access/execution mode only after verifying identity behaviour for the actual Google accounts and device pattern used by the farm team.

## Data and operational safeguards

- Do not share the underlying database spreadsheet with workers merely to let them use the web app.
- Do not expose CSV export or generic CRUD to a role without an explicit permission.
- Keep audit history append-only. Correct posted records through reversal/adjustment workflows.
- ScriptLock serialises Apps Script executions; it does not make a multi-sheet workflow atomic. A service failure can leave partial writes. Every critical workflow needs clear recovery/reconciliation behaviour.
- Before every schema migration, create and verify a backup and run `erpPreviewSchemaMigration()`. Run `erpInstallSchema()` only after reviewing its read-only preview.
- Never run test or failure-injection scenarios against the live farm spreadsheet.

## Release gate

The multi-role application is the intended deliverable. Do not lower the product scope to owner-only to bypass identity work, and do not expose unfinished endpoints to workers by simply changing the manifest. Worker access is enabled only after server-side identity, authorization, farm scope and audit attribution are implemented and tested end to end.
