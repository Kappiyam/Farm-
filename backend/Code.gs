/**
 * Farm Management API — database foundation
 * Version: 0.2.0
 *
 * Bound to the Farm Management Database spreadsheet.
 * Run setupDatabase() manually once from the Apps Script editor.
 * This function creates missing tabs only; it never clears existing data.
 */

const APP_VERSION = "0.2.0";
const APP_SERVICE = "farm-management-api";
const SCHEMA_VERSION = "0.1.0";

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

function doGet() {
  return jsonResponse_(health_());
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
