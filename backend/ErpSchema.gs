/**
 * FarmERP canonical data model.
 *
 * Additive migration only: existing columns and records are preserved.
 * Run erpInstallSchema() only after reviewing the migration preview.
 * This file intentionally does not create organisation or farm business records.
 */
const ERP_SCHEMA_VERSION = "1.0.2";

const ERP_TABLE_DEFINITIONS = Object.freeze({
  Organizations: "organization_id|organization_name|organization_code|country_code|status|created_at|updated_at",
  Users: "user_id|display_name|email|phone|preferred_language|status|created_at|updated_at",
  Roles: "role_id|role_name|description|permissions_json|is_system_role|status|created_at|updated_at",
  UserRoles: "user_role_id|user_id|role_id|scope_type|scope_id|created_at",
  OrganizationUsers: "organization_user_id|organization_id|user_id|membership_role|status|created_at|updated_at",
  FarmMemberships: "farm_membership_id|farm_id|user_id|role_id|status|created_at|updated_at",
  FarmSettings: "farm_setting_id|farm_id|setting_key|setting_value|updated_at",
  Farms: "farm_id|farm_name|farm_code|status|created_at|updated_at|organization_id|country_code|timezone|default_language|currency_code|area_unit|farm_address|contact_name|contact_phone|contact_email",
  Sites: "site_id|farm_id|site_name|site_code|site_type|area_value|area_unit|address|status|notes|created_at|updated_at",
  Fields: "field_id|farm_id|site_id|field_name|field_code|area_value|area_unit|soil_type|irrigation_source|status|notes|created_at|updated_at",
  Plots: "plot_id|farm_id|site_id|field_id|plot_name|plot_code|area_value|area_unit|soil_type|irrigation_zone|slope|status|notes|created_at|updated_at",
  Beds: "bed_id|farm_id|field_id|plot_id|bed_name|bed_code|bed_type|length_value|width_value|area_unit|orientation|mulch_type|drip_laterals|status|notes|created_at|updated_at",
  Infrastructure: "infrastructure_id|farm_id|site_id|field_id|plot_id|infrastructure_type|name|code|capacity|unit|status|commissioned_date|notes|created_at|updated_at",
  Crops: "crop_id|crop_name|crop_category|default_unit|scientific_name|status|created_at|updated_at",
  Varieties: "variety_id|crop_id|variety_name|description|duration_days|propagation_method|status|created_at|updated_at",
  CropProfiles: "crop_profile_id|crop_id|variety_id|profile_name|spacing_row|spacing_plant|spacing_unit|nursery_days|expected_duration_days|expected_yield|yield_unit|nutrient_notes|created_at|updated_at",
  People: "person_id|display_name|phone|email|person_type|preferred_language|joining_date|wage_basis|wage_rate|team_id|status|notes|created_at|updated_at",
  Teams: "team_id|farm_id|team_name|team_leader_id|description|status|created_at|updated_at",
  TeamMembers: "team_member_id|farm_id|team_id|person_id|role|valid_from|valid_to|status|created_at",
  Suppliers: "supplier_id|farm_id|supplier_name|contact_name|phone|email|address|tax_id|payment_terms|status|notes|created_at|updated_at",
  Customers: "customer_id|organization_id|customer_name|customer_type|contact_name|phone|email|address|payment_terms|status|notes|created_at|updated_at",
  Units: "unit_id|unit_name|unit_symbol|dimension|base_unit|conversion_factor|status|created_at|updated_at",
  InventoryItems: "item_id|farm_id|item_name|item_category|base_unit|reorder_level|storage_location|status|description|created_at|updated_at",
  Products: "product_id|organization_id|product_name|product_code|crop_id|grade|unit|description|status|created_at|updated_at",
  DemandRecords: "demand_id|farm_id|customer_id|product_id|crop_id|demand_type|quantity|unit|required_date|valid_until|confidence|status|source_reference|notes|created_at|updated_at",
  ForecastVersions: "forecast_version_id|farm_id|version_name|period_start|period_end|assumptions|status|created_by|created_at",
  PlantingCampaigns: "campaign_id|farm_id|campaign_name|period_start|period_end|status|notes|created_at|updated_at",
  PlantingPlans: "planting_plan_id|farm_id|campaign_id|field_id|plot_id|crop_id|variety_id|planned_area|area_unit|planting_date|expected_harvest_date|plant_count|status|notes|created_at|updated_at",
  CropCycles: "crop_cycle_id|farm_id|location_id|site_id|field_id|plot_id|bed_id|crop_id|variety_id|crop_profile_id|campaign_id|parent_cycle_id|cycle_name|propagation_method|nursery_start_date|planting_date|start_date|expected_end_date|actual_end_date|area_value|area_unit|plant_count|expected_yield|yield_unit|actual_yield|status|created_at|updated_at",
  CropCycleEvents: "cycle_event_id|farm_id|crop_cycle_id|event_type|event_date|growth_stage|plant_count|quantity|unit|notes|recorded_by|created_at",
  TaskTemplates: "template_id|farm_id|template_name|crop_id|variety_id|task_type|description|default_priority|offset_days|duration_days|checklist|status|created_at|updated_at",
  Tasks: "task_id|farm_id|location_id|site_id|field_id|plot_id|bed_id|crop_cycle_id|template_id|title|description|task_type|priority|status|planned_start|due_at|assigned_team|created_by|created_at|updated_at",
  TaskAssignments: "assignment_id|farm_id|task_id|user_id|person_id|team_id|assignment_role|assigned_by|assigned_at|status|notes",
  TaskExecution: "execution_id|farm_id|task_id|person_id|team_id|executed_at|started_at|completed_at|contribution_percent|quantity|quantity_unit|area|area_unit|duration_minutes|output_notes|notes|quality_status|recorded_by|created_at",
  TaskStatusHistory: "status_history_id|farm_id|task_id|from_status|to_status|changed_by|changed_at|reason",
  Attendance: "attendance_id|farm_id|person_id|attendance_date|check_in|check_out|attendance_status|hours_worked|recorded_by|notes|created_at",
  WageTransactions: "wage_transaction_id|farm_id|person_id|task_id|attendance_id|transaction_date|wage_basis|quantity|rate|amount|payment_status|payment_reference|notes|created_at",
  Observations: "observation_id|farm_id|location_id|site_id|field_id|plot_id|bed_id|crop_cycle_id|observed_at|category|pest_or_disease|severity|extent_value|extent_unit|quick_status|description|recommendation|photo_file_ids|recorded_by|created_at",
  ActivityJournal: "journal_id|farm_id|site_id|field_id|plot_id|crop_cycle_id|activity_date|occurred_at|activity_type|title|description|quantity|unit|recorded_by|author_id|created_at",
  IrrigationRuns: "irrigation_run_id|farm_id|water_source|pump_id|started_at|ended_at|duration_minutes|meter_start|meter_end|volume|volume_unit|pressure|notes|recorded_by|created_at",
  IrrigationOperations: "irrigation_operation_id|farm_id|irrigation_run_id|field_id|plot_id|bed_id|valve_code|started_at|ended_at|duration_minutes|volume|volume_unit|status|recorded_by|created_at",
  Applications: "application_id|farm_id|field_id|plot_id|crop_cycle_id|application_type|product_name|item_id|rate|rate_unit|quantity|quantity_unit|water_volume|application_date|method|weather|operator_id|notes|created_at",
  ProcurementOrders: "procurement_id|farm_id|supplier_id|order_number|order_date|expected_date|currency_code|subtotal|tax_amount|total_amount|status|notes|created_by|created_at|updated_at",
  ProcurementLines: "procurement_line_id|farm_id|procurement_id|item_id|description|quantity_ordered|quantity_received|unit|unit_cost|tax_rate|storage_location|created_at|updated_at",
  StockLots: "lot_id|farm_id|item_id|lot_code|received_date|expiry_date|quantity_received|quantity_available|unit|unit_cost|supplier_id|storage_location|status|reference_type|reference_id|created_at",
  InventoryTransactions: "transaction_id|farm_id|item_id|lot_id|transaction_type|quantity|unit|transaction_at|location_id|from_location|to_location|reference_type|reference_id|recorded_by|notes|created_at",
  FarmMadeBatches: "batch_id|farm_id|batch_code|product_name|batch_date|quantity_produced|unit|status|notes|created_by|created_at",
  FarmMadeBatchInputs: "batch_input_id|farm_id|batch_id|item_id|lot_id|quantity_used|unit|created_at",
  HarvestSessions: "harvest_id|farm_id|field_id|plot_id|crop_cycle_id|harvest_date|harvested_by|status|notes|created_at|updated_at",
  HarvestLines: "harvest_line_id|farm_id|harvest_id|crop_id|variety_id|grade|quantity|unit|disposition|lot_code|storage_location|notes|created_at",
  ProduceLots: "produce_lot_id|farm_id|harvest_id|harvest_line_id|crop_id|variety_id|lot_code|grade|quantity_received|quantity_available|unit|disposition|storage_location|status|created_at",
  ProduceLotMovements: "produce_movement_id|farm_id|produce_lot_id|movement_type|quantity|unit|from_location|to_location|reference_type|reference_id|moved_at|recorded_by|notes",
  PackhouseOperations: "packhouse_operation_id|farm_id|produce_lot_id|operation_type|operation_date|input_quantity|output_quantity|unit|wastage_quantity|operator_id|notes|created_at",
  Dispatches: "dispatch_id|farm_id|customer_id|sales_order_id|dispatch_number|dispatch_date|vehicle_number|carrier|status|notes|created_at",
  PriceLists: "price_list_id|organization_id|price_list_name|customer_id|currency_code|valid_from|valid_to|status|created_at|updated_at",
  PriceListLines: "price_list_line_id|price_list_id|product_id|grade|unit|unit_price|minimum_quantity|created_at",
  SalesOrders: "sales_order_id|farm_id|customer_id|order_number|order_date|required_date|currency_code|subtotal|tax_amount|total_amount|status|notes|created_by|created_at|updated_at",
  SalesOrderLines: "sales_line_id|sales_order_id|product_id|description|quantity_ordered|quantity_fulfilled|unit|unit_price|discount_amount|tax_rate|line_total|created_at",
  Fulfilments: "fulfilment_id|farm_id|sales_order_id|fulfilment_reference|fulfilment_date|status|notes|created_by|created_at",
  FulfilmentLines: "fulfilment_line_id|fulfilment_id|sales_order_id|sales_line_id|produce_lot_id|quantity|unit|created_at",
  Invoices: "invoice_id|farm_id|customer_id|sales_order_id|invoice_number|invoice_date|due_date|currency_code|subtotal|tax_amount|total_amount|status|created_by|created_at|updated_at",
  InvoiceLines: "invoice_line_id|invoice_id|sales_line_id|description|quantity|unit|unit_price|tax_rate|line_total|created_at",
  Payments: "payment_id|farm_id|invoice_id|customer_id|account_id|amount|payment_date|payment_method|reference_number|notes|recorded_by|created_at",
  SalesReturns: "sales_return_id|farm_id|sales_order_id|customer_id|return_number|return_date|reason|status|notes|created_at",
  SalesReturnLines: "sales_return_line_id|sales_return_id|sales_line_id|produce_lot_id|quantity|unit|disposition|notes|created_at",
  FinanceEntries: "finance_entry_id|farm_id|entry_date|entry_type|category|description|party_type|party_id|account_id|amount|currency_code|payment_method|reference_type|reference_id|cost_class|plot_id|crop_cycle_id|status|recorded_by|created_at",
  PaymentAccounts: "account_id|farm_id|account_name|account_type|account_number_masked|opening_balance|currency_code|status|notes|created_at|updated_at",
  CostAllocations: "cost_allocation_id|farm_id|finance_entry_id|crop_cycle_id|plot_id|allocation_basis|allocated_amount|currency_code|period_start|period_end|notes|created_at",
  Assets: "asset_id|farm_id|asset_name|asset_code|asset_category|manufacturer|model|serial_number|purchase_date|purchase_cost|current_value|location|status|notes|created_at|updated_at",
  AssetUsage: "asset_usage_id|farm_id|asset_id|person_id|task_id|usage_date|start_at|end_at|hours_used|fuel_quantity|fuel_unit|cost|notes|created_at",
  Maintenance: "maintenance_id|farm_id|asset_id|maintenance_type|scheduled_date|completed_date|service_provider|cost|downtime_hours|status|parts_used|notes|created_at|updated_at",
  CalendarEvents: "event_id|farm_id|title|event_type|start_at|end_at|all_day|site_id|field_id|plot_id|description|recurrence_type|recurrence_interval|recurrence_end|occurrence_limit|status|created_by|created_at|updated_at",
  CalendarExceptions: "calendar_exception_id|event_id|occurrence_start|exception_type|override_json|reason|created_at",
  EventParticipants: "event_participant_id|event_id|person_id|team_id|participation_role|status|created_at",
  Notifications: "notification_id|farm_id|user_id|notification_type|title|message|read_at|created_at",
  SavedViews: "saved_view_id|user_id|farm_id|view_name|module_key|view_config|is_default|created_at|updated_at",
  Attachments: "attachment_id|farm_id|entity_type|entity_id|file_id|file_name|mime_type|size_bytes|storage_provider|uploaded_by|uploaded_at|caption|status|created_at",
  AuditLog: "audit_id|organization_id|farm_id|entity_type|entity_id|action|actor_user_id|occurred_at|change_summary",
  IdempotencyKeys: "idempotency_id|farm_id|request_key|action|result_json|status|started_at|completed_at|error_message|created_at",
  AppConfig: "config_key|config_value|updated_at",
  Locations: "location_id|farm_id|parent_location_id|location_type|location_name|location_code|area_value|area_unit|status"
});

const ERP_TABLE_KEYS = Object.freeze(Object.keys(ERP_TABLE_DEFINITIONS).reduce(function(out, name) {
  out[name] = ERP_TABLE_DEFINITIONS[name].split("|")[0];
  return out;
}, {}));

const ERP_ARCHIVABLE_TABLES = Object.freeze([
  "Sites","Fields","Plots","Beds","Infrastructure","Crops","Varieties","CropProfiles",
  "People","Teams","Suppliers","Customers","Units","InventoryItems","Products",
  "DemandRecords","ForecastVersions","PlantingCampaigns","PlantingPlans","CropCycles",
  "TaskTemplates","Tasks","Observations","ActivityJournal","Assets","Maintenance",
  "CalendarEvents","Notifications","SavedViews","Attachments"
]);

function erpGetSchema() {
  var tables = {};
  Object.keys(ERP_TABLE_DEFINITIONS).forEach(function(name) {
    tables[name] = ERP_TABLE_DEFINITIONS[name].split("|");
  });
  return {
    version: ERP_SCHEMA_VERSION,
    tables: tables,
    keys: ERP_TABLE_KEYS,
    required: {
      Organizations: ["organization_name","organization_code"],
      Farms: ["farm_name","farm_code"],
      Sites: ["farm_id","site_name"],
      Fields: ["farm_id","field_name"],
      Plots: ["farm_id","plot_name"],
      Crops: ["crop_name"],
      Varieties: ["crop_id","variety_name"],
      People: ["display_name"],
      Tasks: ["farm_id","title"],
      Observations: ["farm_id","plot_id","category","observed_at"],
      InventoryItems: ["farm_id","item_name","base_unit"],
      SalesOrders: ["farm_id","customer_id","order_date"],
      SalesOrderLines: ["sales_order_id","product_id","quantity_ordered"],
      FinanceEntries: ["farm_id","entry_date","entry_type","amount"],
      Attachments: ["farm_id","entity_type","entity_id","file_id","file_name"]
    },
    archivable: ERP_ARCHIVABLE_TABLES.slice()
  };
}

/**
 * Read-only migration preview. Reports missing tabs and columns without writing.
 */
function erpPreviewSchemaMigration() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("No active spreadsheet is bound to this project.");
  var createTabs = [], appendColumns = [], mismatches = [];
  Object.keys(ERP_TABLE_DEFINITIONS).forEach(function(name) {
    var expected = ERP_TABLE_DEFINITIONS[name].split("|");
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      createTabs.push({table:name, columns:expected.length});
      return;
    }
    var actual = sheet.getLastColumn()
      ? sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].filter(String)
      : [];
    if (!actual.length) {
      appendColumns.push({table:name, columns:expected});
      return;
    }
    var missing = expected.filter(function(h){ return actual.indexOf(h) < 0; });
    if (missing.length) appendColumns.push({table:name, columns:missing});
    if (actual[0] !== expected[0]) mismatches.push({table:name, expectedKey:expected[0], actualFirstColumn:actual[0]});
  });
  return {ok:mismatches.length===0, readOnly:true, schemaVersion:ERP_SCHEMA_VERSION,
    tableCount:Object.keys(ERP_TABLE_DEFINITIONS).length, createTabs:createTabs,
    appendColumns:appendColumns, mismatches:mismatches};
}

/**
 * Additive migration. Never clears, renames, reorders or deletes existing data.
 * It refuses to proceed if an existing tab has a conflicting primary-key column.
 */
function erpInstallSchema() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var preview = erpPreviewSchemaMigration();
    if (!preview.ok) throw new Error("Schema migration stopped: primary-key mismatch. Review erpPreviewSchemaMigration().");
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var created = [], appended = [];
    Object.keys(ERP_TABLE_DEFINITIONS).forEach(function(name) {
      var headers = ERP_TABLE_DEFINITIONS[name].split("|");
      var sheet = ss.getSheetByName(name);
      if (!sheet) {
        sheet = ss.insertSheet(name);
        sheet.getRange(1,1,1,headers.length).setValues([headers]);
        sheet.setFrozenRows(1);
        created.push(name);
        return;
      }
      var existing = sheet.getLastColumn()
        ? sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0].filter(String)
        : [];
      if (!existing.length) {
        sheet.getRange(1,1,1,headers.length).setValues([headers]);
        sheet.setFrozenRows(1);
        created.push(name);
        return;
      }
      var missing = headers.filter(function(h){ return existing.indexOf(h)<0; });
      if (missing.length) {
        sheet.getRange(1,sheet.getLastColumn()+1,1,missing.length).setValues([missing]);
        appended.push({table:name,columns:missing});
      }
      if (sheet.getFrozenRows()<1) sheet.setFrozenRows(1);
    });
    return {ok:true,schemaVersion:ERP_SCHEMA_VERSION,createdTabs:created,appendedColumns:appended,
      tableCount:Object.keys(ERP_TABLE_DEFINITIONS).length};
  } finally {
    lock.releaseLock();
  }
}
