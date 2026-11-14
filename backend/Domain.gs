/**
 * FarmERP domain services — configurable application data layer.
 * This module is intentionally additive. It does not run automatically.
 * All records are accessed by header name; never depend on sheet column order.
 */
const FARMERP_DOMAIN_VERSION = "0.1.0";

const FARMERP_DOMAIN_TABLES = Object.freeze({
  Sites: ["site_id","farm_id","site_name","site_code","address","status","created_at","updated_at"],
  Infrastructure: ["infrastructure_id","farm_id","location_id","infrastructure_type","name","code","description","status","created_at","updated_at"],
  Units: ["unit_id","unit_name","unit_symbol","dimension","is_base_unit","status"],
  People: ["person_id","display_name","phone","email","worker_type","employment_type","joining_date","status","notes","created_at","updated_at"],
  Suppliers: ["supplier_id","supplier_name","contact_name","phone","email","address","tax_reference","status","created_at","updated_at"],
  Customers: ["customer_id","customer_name","customer_type","contact_name","phone","email","address","status","created_at","updated_at"],
  CropProfiles: ["crop_profile_id","crop_id","variety_id","crop_name","variety_name","duration_days","spacing_row","spacing_plant","spacing_unit","default_unit","status","created_at","updated_at"],
  PlantingPlans: ["planting_plan_id","farm_id","location_id","crop_id","variety_id","plan_name","planned_area","area_unit","target_planting_date","target_harvest_date","planned_quantity","quantity_unit","status","created_at","updated_at"],
  TaskTemplates: ["template_id","farm_id","crop_id","task_name","task_type","days_from_planting","default_duration","default_role","checklist_json","status","created_at","updated_at"],
  TaskExecution: ["execution_id","task_id","person_id","started_at","completed_at","duration_minutes","quantity","quantity_unit","area","area_unit","notes","evidence_file_id","recorded_by","created_at"],
  Attendance: ["attendance_id","farm_id","person_id","work_date","check_in","check_out","attendance_status","notes","recorded_by","created_at","updated_at"],
  IrrigationRuns: ["irrigation_id","farm_id","location_id","started_at","ended_at","water_source","duration_minutes","estimated_volume","volume_unit","valves_json","method","recorded_by","notes","created_at"],
  Applications: ["application_id","farm_id","location_id","crop_cycle_id","application_type","applied_at","product_item_id","dose","dose_unit","water_volume","water_unit","target_pest","weather_notes","recorded_by","notes","created_at"],
  Procurement: ["procurement_id","farm_id","supplier_id","document_number","order_date","expected_date","status","total_amount","currency_code","notes","created_by","created_at","updated_at"],
  StockLots: ["lot_id","item_id","lot_code","received_date","expiry_date","quantity_received","quantity_available","unit","storage_location","supplier_id","unit_cost","status","created_at","updated_at"],
  StockMovements: ["movement_id","item_id","lot_id","farm_id","location_id","movement_type","quantity","unit","unit_cost","reference_type","reference_id","occurred_at","recorded_by","reason","idempotency_key","created_at"],
  HarvestSessions: ["harvest_id","farm_id","location_id","crop_cycle_id","harvest_date","harvested_by","status","notes","created_at","updated_at"],
  HarvestLines: ["harvest_line_id","harvest_id","crop_id","variety_id","grade","quantity","unit","destination","produce_lot_code","notes"],
  Products: ["product_id","product_name","product_category","base_unit","selling_price","currency_code","status","created_at","updated_at"],
  SalesOrders: ["sales_order_id","farm_id","customer_id","order_number","order_date","required_date","status","currency_code","subtotal","discount","total_amount","notes","created_by","created_at","updated_at"],
  SalesOrderLines: ["sales_line_id","sales_order_id","product_id","description","quantity","unit","unit_price","line_total"],
  Invoices: ["invoice_id","farm_id","customer_id","sales_order_id","invoice_number","invoice_date","due_date","status","currency_code","subtotal","tax_amount","total_amount","created_at","updated_at"],
  Payments: ["payment_id","farm_id","customer_id","invoice_id","payment_date","amount","currency_code","payment_method","reference_number","notes","recorded_by","created_at"],
  FinanceEntries: ["finance_entry_id","farm_id","entry_date","entry_type","category","description","amount","currency_code","payment_account","reference_type","reference_id","cost_class","status","recorded_by","created_at"],
  CostAllocations: ["allocation_id","finance_entry_id","farm_id","crop_cycle_id","location_id","allocation_basis","allocated_amount","currency_code","notes","created_at"],
  Assets: ["asset_id","farm_id","asset_name","asset_category","asset_code","purchase_date","purchase_cost","currency_code","current_status","location_id","notes","created_at","updated_at"],
  Maintenance: ["maintenance_id","asset_id","maintenance_type","scheduled_date","completed_date","cost","currency_code","downtime_hours","service_provider","notes","status","created_at"],
  CalendarEvents: ["event_id","farm_id","title","event_type","start_at","end_at","all_day","location_id","description","recurrence_rule","status","created_by","created_at","updated_at"],
  Attachments: ["attachment_id","farm_id","entity_type","entity_id","drive_file_id","file_name","mime_type","uploaded_by","created_at"],
  SavedViews: ["saved_view_id","user_id","farm_id","view_name","module_key","filters_json","sort_json","created_at","updated_at"]
});

const FARMERP_ENTITY_KEYS = Object.freeze({
  Sites:"site_id", Infrastructure:"infrastructure_id", Units:"unit_id", People:"person_id",
  Suppliers:"supplier_id", Customers:"customer_id", CropProfiles:"crop_profile_id",
  PlantingPlans:"planting_plan_id", TaskTemplates:"template_id", TaskExecution:"execution_id",
  Attendance:"attendance_id", IrrigationRuns:"irrigation_id", Applications:"application_id",
  Procurement:"procurement_id", StockLots:"lot_id", StockMovements:"movement_id",
  HarvestSessions:"harvest_id", HarvestLines:"harvest_line_id", Products:"product_id",
  SalesOrders:"sales_order_id", SalesOrderLines:"sales_line_id", Invoices:"invoice_id",
  Payments:"payment_id", FinanceEntries:"finance_entry_id", CostAllocations:"allocation_id",
  Assets:"asset_id", Maintenance:"maintenance_id", CalendarEvents:"event_id",
  Attachments:"attachment_id", SavedViews:"saved_view_id"
});

/** Additive schema installation. Existing values and columns are retained. */
function installFarmErpDomainSchema() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Bound database spreadsheet is unavailable.");
  const created = [], appended = [];
  Object.keys(FARMERP_DOMAIN_TABLES).forEach(function(name) {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1,1,1,FARMERP_DOMAIN_TABLES[name].length).setValues([FARMERP_DOMAIN_TABLES[name]]);
      sh.setFrozenRows(1);
      created.push(name);
      return;
    }
    const last = sh.getLastColumn();
    const headers = last ? sh.getRange(1,1,1,last).getDisplayValues()[0].filter(String) : [];
    const missing = FARMERP_DOMAIN_TABLES[name].filter(h => headers.indexOf(h) < 0);
    if (missing.length) {
      sh.getRange(1,last+1,1,missing.length).setValues([missing]);
      if (sh.getFrozenRows() < 1) sh.setFrozenRows(1);
      appended.push({table:name,headers:missing});
    }
  });
  return {ok:true,version:FARMERP_DOMAIN_VERSION,created,appended};
}

/** Returns metadata for the app shell and available modules. */
function farmErpGetApplicationData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Database unavailable.");
  const farms = farmErpReadTable_("Farms", 500);
  const orgs = farmErpReadTable_("Organizations", 100);
  const tableStatus = {};
  Object.keys(FARMERP_DOMAIN_TABLES).forEach(name => tableStatus[name] = !!ss.getSheetByName(name));
  return {
    ok:true, appVersion:APP_VERSION, schemaVersion:SCHEMA_VERSION,
    domainVersion:FARMERP_DOMAIN_VERSION,
    databaseName:ss.getName(),
    farms:farms.rows, organizations:orgs.rows,
    modules:[
      {key:"dashboard",label:"Dashboard",group:"Overview"},
      {key:"farm-structure",label:"Farms & fields",group:"Farm"},
      {key:"crops",label:"Crops & varieties",group:"Production"},
      {key:"planting",label:"Production planning",group:"Production"},
      {key:"tasks",label:"Tasks & workforce",group:"Operations"},
      {key:"field-ops",label:"Scouting & field operations",group:"Operations"},
      {key:"irrigation",label:"Irrigation & fertigation",group:"Operations"},
      {key:"inventory",label:"Inventory & procurement",group:"Supply"},
      {key:"harvest",label:"Harvest & traceability",group:"Supply"},
      {key:"sales",label:"Customers & sales",group:"Commercial"},
      {key:"finance",label:"Finance & costs",group:"Commercial"},
      {key:"assets",label:"Assets & maintenance",group:"Administration"},
      {key:"calendar",label:"Calendar & events",group:"Administration"},
      {key:"reports",label:"Reports & exports",group:"Administration"},
      {key:"settings",label:"Settings & masters",group:"Administration"}
    ],
    schemaTables:tableStatus
  };
}

/**
 * Generic read service for allow-listed domain tables.
 * This is a private-app service; do not expose it through public JSONP.
 */
function farmErpListRecords(tableName, options) {
  if (!FARMERP_DOMAIN_TABLES[tableName] && !TABLE_SCHEMAS[tableName] && !MULTI_FARM_TABLE_SCHEMAS[tableName]) {
    throw new Error("Unsupported data table.");
  }
  options = options || {};
  return farmErpReadTable_(tableName, Math.min(Math.max(Number(options.limit) || 200,1),1000), options);
}

function farmErpReadTable_(tableName, limit, options) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss && ss.getSheetByName(tableName);
  if (!sh) return {table:tableName,headers:[],rows:[],total:0};
  const lastRow=sh.getLastRow(), lastCol=sh.getLastColumn();
  if (!lastRow || !lastCol) return {table:tableName,headers:[],rows:[],total:0};
  const headers=sh.getRange(1,1,1,lastCol).getDisplayValues()[0];
  const start=Math.max(2,lastRow-limit+1);
  const values=lastRow>=2 ? sh.getRange(start,1,lastRow-start+1,lastCol).getValues() : [];
  const rows=values.map(row => {
    const obj={};
    headers.forEach((h,i) => { if(h) obj[h]=farmErpSerialiseValue_(row[i]); });
    return obj;
  }).filter(obj => Object.keys(obj).some(k => obj[k] !== "" && obj[k] !== null));
  const filter=options && options.filter;
  const filtered=filter && typeof filter==="object"
    ? rows.filter(row => Object.keys(filter).every(k => String(row[k] == null ? "" : row[k])===String(filter[k])))
    : rows;
  return {table:tableName,headers:headers,rows:filtered,total:filtered.length};
}

function farmErpSerialiseValue_(value) {
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * Validated create/update service. Updates are by stable ID and only supplied
 * fields are changed. Deletion is intentionally not supported for posted data.
 */
function farmErpSaveRecord(tableName, record, options) {
  const schema=FARMERP_DOMAIN_TABLES[tableName];
  const key=FARMERP_ENTITY_KEYS[tableName];
  if (!schema || !key) throw new Error("This table is not enabled for editing.");
  if (!record || typeof record!=="object" || Array.isArray(record)) throw new Error("A record object is required.");
  const allowed={}; schema.forEach(h=>allowed[h]=true);
  Object.keys(record).forEach(h=>{if(!allowed[h]) throw new Error("Unknown field: "+h);});
  const ss=SpreadsheetApp.getActiveSpreadsheet(), sh=ss.getSheetByName(tableName);
  if(!sh) throw new Error("Domain schema is not installed. Run installFarmErpDomainSchema().");
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000)) throw new Error("The database is busy. Please retry.");
  try {
    const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
    const keyCol=headers.indexOf(key)+1;
    if(!keyCol) throw new Error("Primary key column is missing: "+key);
    const suppliedId=String(record[key]||"").trim();
    const id=suppliedId || Utilities.getUuid();
    const now=new Date();
    const last=sh.getLastRow();
    let rowNumber=0;
    if(suppliedId && last>=2) {
      const ids=sh.getRange(2,keyCol,last-1,1).getDisplayValues().flat();
      const index=ids.indexOf(suppliedId);
      if(index>=0) rowNumber=index+2;
    }
    const isUpdate=!!rowNumber;
    const existing=isUpdate ? sh.getRange(rowNumber,1,1,headers.length).getValues()[0] : new Array(headers.length).fill("");
    const before={};
    headers.forEach((h,i)=>before[h]=farmErpSerialiseValue_(existing[i]));
    const values=headers.map((h,i)=>{
      if(Object.prototype.hasOwnProperty.call(record,h)) return record[h];
      if(!isUpdate && h===key) return id;
      if(!isUpdate && h==="created_at") return now;
      if(h==="updated_at") return now;
      return existing[i];
    });
    if(isUpdate) sh.getRange(rowNumber,1,1,headers.length).setValues([values]);
    else { sh.appendRow(values); rowNumber=sh.getLastRow(); }
    farmErpWriteAudit_(tableName,id,isUpdate?"update":"create",before,record);
    return {ok:true,table:tableName,id:id,created:!isUpdate,record:farmErpRowObject_(headers,values)};
  } finally { lock.releaseLock(); }
}

function farmErpRowObject_(headers, values) {
  const out={}; headers.forEach((h,i)=>out[h]=farmErpSerialiseValue_(values[i])); return out;
}

function farmErpWriteAudit_(entityType, entityId, action, before, after) {
  const ss=SpreadsheetApp.getActiveSpreadsheet(), sh=ss.getSheetByName("AuditLog");
  if(!sh) return;
  const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  const item={
    audit_id:Utilities.getUuid(),entity_type:entityType,entity_id:entityId,action:action,
    actor_user_id:Session.getActiveUser().getEmail() || "owner-session",
    occurred_at:new Date(),change_summary:JSON.stringify({before:before,after:after})
  };
  sh.appendRow(headers.map(h=>Object.prototype.hasOwnProperty.call(item,h)?item[h]:""));
}

/** Dashboard summary built from current records; planned/actual remain separate. */
function farmErpGetDashboard(farmId) {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const names=["Farms","Locations","CropCycles","Tasks","Observations","InventoryItems","InventoryTransactions","HarvestSessions","SalesOrders","FinanceEntries","Assets"];
  const counts={};
  names.forEach(name=>{
    const sh=ss.getSheetByName(name);
    counts[name]=sh ? Math.max(0,sh.getLastRow()-1) : 0;
  });
  const tasks=farmErpReadTable_("Tasks",1000).rows;
  const today=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyy-MM-dd");
  const due=tasks.filter(t=>String(t.due_at||"").slice(0,10)===today && !["completed","cancelled"].includes(String(t.status||"").toLowerCase()));
  const overdue=tasks.filter(t=>t.due_at && String(t.due_at).slice(0,10)<today && !["completed","cancelled"].includes(String(t.status||"").toLowerCase()));
  return {ok:true,generatedAt:new Date().toISOString(),counts,todayTasks:due.length,overdueTasks:overdue.length,taskStatus:tasks.reduce((a,t)=>{const k=t.status||"unspecified";a[k]=(a[k]||0)+1;return a;},{})};
}
