/**
 * Farm Management API — database foundation
 * Version: 0.4.0
 *
 * Bound to the Farm Management Database spreadsheet.
 * Run setupDatabase() manually once from the Apps Script editor.
 * This function creates missing tabs only; it never clears existing data.
 */

const APP_VERSION = "0.4.0";
const APP_SERVICE = "farm-management-api";
const SCHEMA_VERSION = "0.2.0";

const TABLE_SCHEMAS = Object.freeze({
  AppConfig: ["config_key", "config_value", "updated_at"],
  Users: ["user_id", "display_name", "email", "phone", "status", "created_at", "updated_at"],
  Roles: ["role_id", "role_name", "description", "status"],
  UserRoles: ["user_role_id", "user_id", "role_id", "scope_type", "scope_id", "created_at"],
  Farms: ["farm_id", "farm_name", "farm_code", "status", "created_at", "updated_at"],
  Locations: ["location_id", "farm_id", "parent_location_id", "location_type", "location_name", "location_code", "area_value", "area_unit", "status"],
  Crops: ["crop_id", "crop_name", "crop_category", "status", "created_at", "updated_at"],
  Varieties: ["variety_id", "crop_id", "variety_name", "description", "status"],
  CropCycles: ["crop_cycle_id", "farm_id", "location_id", "crop_id", "variety_id", "cycle_name", "propagation_method", "start_date", "expected_end_date", "status", "created_at", "updated_at"],
  Tasks: ["task_id", "farm_id", "location_id", "crop_cycle_id", "title", "description", "task_type", "priority", "status", "planned_start", "due_at", "created_by", "created_at", "updated_at"],
  TaskAssignments: ["assignment_id", "task_id", "user_id", "assigned_by", "assigned_at", "status"],
  Observations: ["observation_id", "farm_id", "location_id", "crop_cycle_id", "observed_at", "category", "severity", "description", "recorded_by", "created_at"],
  InventoryItems: ["item_id", "item_name", "item_category", "base_unit", "status", "created_at", "updated_at"],
  InventoryTransactions: ["transaction_id", "item_id", "transaction_type", "quantity", "unit", "transaction_at", "location_id", "reference_type", "reference_id", "recorded_by", "created_at"],
  AuditLog: ["audit_id", "entity_type", "entity_id", "action", "actor_user_id", "occurred_at", "change_summary"],
  SchemaInfo: ["schema_version", "installed_at", "app_version"]
});

function setupDatabase() {
  const started = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("No active spreadsheet. Open this bound script from the target database.");

  const created = [];
  const verified = [];

  Object.keys(TABLE_SCHEMAS).forEach(function(tableName) {
    const headers = TABLE_SCHEMAS[tableName];
    let sheet = ss.getSheetByName(tableName);

    if (!sheet) {
      sheet = ss.insertSheet(tableName);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      created.push(tableName);
      return;
    }

    const lastColumn = sheet.getLastColumn();
    if (sheet.getLastRow() > 0 && lastColumn > 0) {
      const existing = sheet.getRange(1, 1, 1, Math.max(lastColumn, headers.length)).getDisplayValues()[0];
      const actual = existing.slice(0, headers.length);
      const matches = headers.every(function(header, index) { return actual[index] === header; });
      if (!matches) {
        throw new Error("Schema check failed for tab '" + tableName + "'. No existing data was changed. Expected headers: " + headers.join(", "));
      }
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      created.push(tableName);
    }
    verified.push(tableName);
  });

  const schemaSheet = ss.getSheetByName("SchemaInfo");
  if (schemaSheet.getLastRow() === 1) {
    schemaSheet.appendRow([SCHEMA_VERSION, new Date().toISOString(), APP_VERSION]);
  }

  const result = {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    spreadsheetId: ss.getId(),
    createdTabs: created,
    verifiedTabs: verified,
    elapsedMs: Date.now() - started
  };
  console.log(JSON.stringify(result));
  return result;
}

/**
 * Public, read-only diagnostics only.
 * probe=light avoids Spreadsheet service calls.
 * probe=sheet measures opening the bound spreadsheet and reading its name.
 * JSONP must never be used for authenticated records or write actions.
 */
function doGet(event) {
  const started = Date.now();
  const params = event && event.parameter ? event.parameter : {};
  if (String(params.mode || "") === "native-benchmark") {
    return HtmlService.createHtmlOutputFromFile("NativeBenchmark")
      .setTitle("Farm Management — Native API Benchmark");
  }
  if (String(params.mode || "") === "app") {
    return HtmlService.createHtmlOutputFromFile("App")
      .setTitle("Farm Management");
  }
  const probe = String(params.probe || "");
  let result;

  if (probe === "light") {
    result = {
      ok: true,
      service: APP_SERVICE,
      version: APP_VERSION,
      probe: "light",
      status: "api_ready"
    };
  } else if (probe === "sheet") {
    const openStarted = Date.now();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const spreadsheetOpenMs = Date.now() - openStarted;
    const nameStarted = Date.now();
    const databaseName = ss ? ss.getName() : null;
    const spreadsheetNameMs = Date.now() - nameStarted;

    result = {
      ok: !!ss,
      service: APP_SERVICE,
      version: APP_VERSION,
      probe: "sheet",
      status: ss ? "database_connected" : "database_unavailable",
      databaseName: databaseName,
      spreadsheetOpenMs: spreadsheetOpenMs,
      spreadsheetNameMs: spreadsheetNameMs
    };
  } else {
    result = health_();
  }

  result.serverTotalMs = Date.now() - started;
  result.timestamp = new Date().toISOString();

  const callback = String(params.callback || "");
  if (callback) {
    if (!/^[A-Za-z_$][0-9A-Za-z_$]{0,63}$/.test(callback)) {
      return jsonResponse_({ ok: false, code: "BAD_CALLBACK", error: "Invalid callback name" });
    }
    return ContentService
      .createTextOutput(callback + "(" + JSON.stringify(result) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return jsonResponse_(result);
}

/**
 * Native HTML Service benchmark methods.
 * These return timing metadata only; they do not expose farm records.
 */
function nativeProbeLight() {
  const started = Date.now();
  return {
    ok: true,
    service: APP_SERVICE,
    version: APP_VERSION,
    probe: "light",
    status: "api_ready",
    serverTotalMs: Date.now() - started
  };
}

function nativeProbeSheet() {
  const started = Date.now();
  const openStarted = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const spreadsheetOpenMs = Date.now() - openStarted;
  const nameStarted = Date.now();
  const databaseName = ss ? ss.getName() : null;
  const spreadsheetNameMs = Date.now() - nameStarted;
  return {
    ok: !!ss,
    service: APP_SERVICE,
    version: APP_VERSION,
    probe: "sheet",
    status: ss ? "database_connected" : "database_unavailable",
    databaseName: databaseName,
    spreadsheetOpenMs: spreadsheetOpenMs,
    spreadsheetNameMs: spreadsheetNameMs,
    serverTotalMs: Date.now() - started
  };
}

/**
 * Native application overview handshake.
 * Returns only deployment and database health metadata; no farm records.
 */
function nativeAppOverview() {
  const started = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    ok: !!ss,
    service: APP_SERVICE,
    version: APP_VERSION,
    status: ss ? "database_connected" : "database_unavailable",
    databaseName: ss ? ss.getName() : null,
    serverElapsedMs: Date.now() - started
  };
}

function doPost(event) {
  const started = Date.now();
  try {
    const payload = parseRequest_(event);
    if (payload.action === "health") {
      const result = health_();
      result.elapsedMs = Date.now() - started;
      return jsonResponse_(result);
    }
    return jsonResponse_({ ok: false, code: "NOT_FOUND", error: "Unsupported action" });
  } catch (error) {
    console.error("API error: " + (error && error.stack ? error.stack : error));
    return jsonResponse_({ ok: false, code: "BAD_REQUEST", error: "Invalid request" });
  }
}

function health_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return {
    ok: true,
    service: APP_SERVICE,
    version: APP_VERSION,
    status: ss ? "database_connected" : "database_unavailable",
    databaseName: ss ? ss.getName() : null,
    timestamp: new Date().toISOString()
  };
}

function parseRequest_(event) {
  if (!event || !event.postData || !event.postData.contents) {
    throw new Error("Request body is missing");
  }
  return JSON.parse(event.postData.contents);
}

function jsonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}


/**
 * Multi-farm foundation migration.
 * Safe, additive only: creates missing organisation/farm access tabs and appends
 * missing Farms columns. It never clears, renames, or rewrites existing records.
 * Run upgradeMultiFarmSchema() manually once after deploying this version.
 */
const MULTI_FARM_TABLE_SCHEMAS = Object.freeze({
  Organizations: ["organization_id", "organization_name", "organization_code", "status", "created_at", "updated_at"],
  OrganizationUsers: ["organization_user_id", "organization_id", "user_id", "membership_role", "status", "created_at", "updated_at"],
  FarmMemberships: ["farm_membership_id", "farm_id", "user_id", "role_id", "status", "created_at", "updated_at"],
  FarmSettings: ["farm_setting_id", "farm_id", "setting_key", "setting_value", "updated_at"]
});

const FARM_ADDITIONAL_COLUMNS = [
  "organization_id", "country_code", "timezone", "default_language",
  "currency_code", "area_unit", "farm_address", "contact_name",
  "contact_phone", "contact_email"
];

function upgradeMultiFarmSchema() {
  const started = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("No active spreadsheet. Open this bound script from the target database.");

  const createdTabs = [];
  const appendedFarmColumns = [];

  Object.keys(MULTI_FARM_TABLE_SCHEMAS).forEach(function(tableName) {
    const headers = MULTI_FARM_TABLE_SCHEMAS[tableName];
    let sheet = ss.getSheetByName(tableName);
    if (!sheet) {
      sheet = ss.insertSheet(tableName);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      createdTabs.push(tableName);
      return;
    }
    ensureTrailingHeaders_(sheet, headers, tableName);
  });

  const farmsSheet = ss.getSheetByName("Farms");
  if (!farmsSheet) throw new Error("Farms tab is missing. Run the original database setup first.");
  const farmColumnResult = ensureTrailingHeaders_(farmsSheet, FARM_ADDITIONAL_COLUMNS, "Farms");
  farmColumnResult.appended.forEach(function(header) { appendedFarmColumns.push(header); });

  // Record the installed schema version while preserving the original install timestamp.
  const schemaSheet = ss.getSheetByName("SchemaInfo");
  if (!schemaSheet) throw new Error("SchemaInfo tab is missing. Run the original database setup first.");
  const schemaHeaders = schemaSheet.getRange(1, 1, 1, schemaSheet.getLastColumn()).getDisplayValues()[0];
  const schemaVersionCol = schemaHeaders.indexOf("schema_version") + 1;
  const installedAtCol = schemaHeaders.indexOf("installed_at") + 1;
  const appVersionCol = schemaHeaders.indexOf("app_version") + 1;
  if (!schemaVersionCol || !installedAtCol || !appVersionCol) {
    throw new Error("SchemaInfo headers are incomplete. No schema version metadata was changed.");
  }
  if (schemaSheet.getLastRow() < 2) {
    const metadata = [];
    metadata[schemaVersionCol - 1] = SCHEMA_VERSION;
    metadata[installedAtCol - 1] = new Date().toISOString();
    metadata[appVersionCol - 1] = APP_VERSION;
    schemaSheet.appendRow(metadata);
  } else {
    schemaSheet.getRange(2, schemaVersionCol).setValue(SCHEMA_VERSION);
    schemaSheet.getRange(2, appVersionCol).setValue(APP_VERSION);
  }

  const result = {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdTabs: createdTabs,
    verifiedTabs: Object.keys(MULTI_FARM_TABLE_SCHEMAS),
    farmColumnsVerified: appendedFarmColumns,
    elapsedMs: Date.now() - started
  };
  console.log(JSON.stringify(result));
  return result;
}

/**
 * Appends only absent headers. Existing columns and row data are untouched.
 * If a requested header already exists, it is left in place.
 */
function ensureTrailingHeaders_(sheet, requiredHeaders, tableName) {
  const lastColumn = sheet.getLastColumn();
  const existing = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].filter(String)
    : [];
  const missing = requiredHeaders.filter(function(header) {
    return existing.indexOf(header) === -1;
  });
  if (missing.length) {
    sheet.getRange(1, lastColumn + 1, 1, missing.length).setValues([missing]);
    if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);
  }
  return { table: tableName, appended: missing };
}
