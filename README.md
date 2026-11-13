# Farm Management Application

A configurable farm-management application. The first deployment will validate the system on one farm, but farm-specific identity and operating data must remain configuration—not hard-coded application logic.

## Initial architecture

- **Frontend:** HTML, CSS and JavaScript; static hosting from GitHub Pages or another static host.
- **Backend:** Google Apps Script Web App.
- **Structured data:** Google Sheets (introduced in the database foundation step).
- **Files and images:** Google Drive (introduced with the relevant modules).
- **Configuration:** frontend environment settings plus a backend-managed farm configuration profile.

## Repository structure

- `index.html` — application shell
- `config.js` — public frontend configuration; contains no secrets
- `assets/app.css` — responsive application styles
- `assets/app.js` — navigation and initial API connection check
- `backend/Code.gs` — initial Apps Script health endpoint

## Local frontend preview

Serve the repository root with any static web server. Opening `index.html` directly may work for the shell, but use a local server for reliable fetch behaviour.

## Configure the backend URL

1. Create or open the Google Apps Script project.
2. Add the contents of `backend/Code.gs`.
3. Deploy as a Web App.
4. Set access according to the intended test environment and security requirements.
5. Copy the deployed Web App URL into `apiUrl` in `config.js`.
6. Open the frontend and select **Check connection**.

The health endpoint is public in this initial development version and returns only service status, version and timestamp. Do not put credentials or private keys in `config.js`.

## Development principles

1. Keep farm-specific values out of source code.
2. Separate master data from operational transactions.
3. Validate the data model before building dependent screens.
4. Enforce authentication and permissions on the server, not only in the browser.
5. Do not treat cached browser data as the authoritative database.
6. Add offline writes only with an explicit queue, idempotency and conflict strategy.
7. Test each module against the standard Farm Management Application specification before expanding scope.

## Current milestone

**Foundation 0.1.0:** application shell, basic navigation, frontend configuration and backend health endpoint.

Authentication, farm setup persistence, database creation and operational modules are not implemented yet.