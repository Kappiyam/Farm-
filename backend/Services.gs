/**
 * FarmERP application services.
 * Standard configurable farm-management domain. No farm-specific defaults.
 * Spreadsheet tables are append-only schema migrations; transactions are ledger based.
 */
const ERP_VERSION = "1.0.0";
const ERP_SCHEMA_VERSION = "1.0.0";

const ERP_TABLES = Object.freeze({
  Organizations: ["organization_id","organization_name","organization_code","status","created_at","updated_at"],
  Users: ["user_id","display_name","email","phone","status","preferred_language","pin_hash","last_login_at","created_at","updated_at"],
  Roles: ["role_id","role_name","description","permissions_json","is_system_role","status","created_at","updated_at"],
  UserRoles: ["user_role_id","user_id","role_id","scope_type","scope_id","assigned_by","created_at"],
  Teams: ["team_id","farm_id","team_name","team_leader_id","status","created_at","updated_at"],
  TeamMembers: ["team_member_id","team_id","person_id","valid_from","valid_to","status","created_at","updated_at"],
  OrganizationUsers: ["organization_user_id","organization_id","user_id","membership_role","status","created_at","updated_at"],
  FarmMemberships: ["farm_membership_id","farm_id","user_id","role_id","status","created_at","updated_at"],
  FarmSettings: ["farm_setting_id","farm_id","setting_key","setting_value","updated_at"],
  Farms: ["farm_id","farm_name","farm_code","organization_id","country_code","timezone","default_language","currency_code","area_unit","farm_address","contact_name","contact_phone","contact_email","financial_year_start","status","created_at","updated_at"],
  Sites: ["site_id","farm_id","site_name","site_code","address","area_value","area_unit","status","created_at","updated_at"],
  Fields: ["field_id","farm_id","site_id","field_name","field_code","area_value","area_unit","production_type","soil_type","status","created_at","updated_at"],
  Plots: ["plot_id","farm_id","field_id","plot_name","plot_code","area_value","area_unit","soil_type","irrigation_zone","valve_code","status","created_at","updated_at"],
  Beds: ["bed_id","farm_id","plot_id","bed_name","bed_code","length_value","width_value","area_value","area_unit","bed_type","status","created_at","updated_at"],
  Infrastructure: ["infrastructure_id","farm_id","site_id","field_id","infrastructure_type","name","code","description","status","created_at","updated_at"],
  Units: ["unit_id","unit_name","unit_symbol","dimension","conversion_to_base","base_unit_id","status","created_at","updated_at"],
  Crops: ["crop_id","crop_name","crop_category","default_unit","duration_days","status","created_at","updated_at"],
  Varieties: ["variety_id","crop_id","variety_name","propagation_method","duration_days","spacing_row","spacing_plant","spacing_unit","expected_yield","yield_unit","description","status","created_at","updated_at"],
  CropProfiles: ["crop_profile_id","crop_id","variety_id","production_system","propagation_method","nursery_days","duration_days","germination_rate","survival_rate","expected_yield","yield_unit","harvest_profile_json","resource_rates_json","assumption_basis","status","created_at","updated_at"],
  PlantingCampaigns: ["campaign_id","farm_id","campaign_name","start_date","end_date","status","notes","created_by","created_at","updated_at"],
  PlantingPlans: ["planting_plan_id","campaign_id","farm_id","field_id","plot_id","crop_id","variety_id","planned_area","area_unit","target_planting_date","target_harvest_date","planned_plant_count","planned_seed_quantity","seed_unit","status","created_at","updated_at"],
  CropCycles: ["crop_cycle_id","farm_id","field_id","plot_id","crop_id","variety_id","campaign_id","cycle_name","production_system","propagation_method","nursery_date","sowing_date","transplant_date","start_date","expected_end_date","actual_end_date","area_value","area_unit","plant_count","crop_stage","forecast_stage","observed_stage","stage_observed_at","forecast_yield","yield_unit","forecast_basis","forecast_confidence","status","parent_cycle_id","notes","created_by","created_at","updated_at"],
  CropCycleEvents: ["cycle_event_id","crop_cycle_id","event_type","event_date","stage","quantity","unit","description","recorded_by","created_at"],
  TaskTemplates: ["template_id","farm_id","crop_id","variety_id","template_name","task_type","trigger_type","trigger_offset_days","recurrence_rule","default_duration_minutes","default_priority","checklist_json","status","created_at","updated_at"],
  Tasks: ["task_id","farm_id","site_id","field_id","plot_id","crop_cycle_id","template_id","event_id","title","description","task_type","priority","status","planned_start","due_at","estimated_duration_minutes","assigned_team","created_by","created_at","updated_at"],
  TaskAssignments: ["assignment_id","task_id","person_id","user_id","team_name","assignment_role","assigned_by","assigned_at","status"],
  TaskExecution: ["execution_id","task_id","person_id","contribution_percent","started_at","completed_at","duration_minutes","quantity","quantity_unit","area","area_unit","evidence_file_id","notes","exception_reason","review_status","reviewed_by","reviewed_at","recorded_by","created_at"],
  People: ["person_id","display_name","phone","email","person_type","employment_type","preferred_language","skills","wage_basis","wage_rate","currency_code","joining_date","status","notes","created_at","updated_at"],
  Attendance: ["attendance_id","farm_id","person_id","work_date","check_in","check_out","attendance_status","total_minutes","notes","recorded_by","created_at","updated_at"],
  WageTransactions: ["wage_transaction_id","farm_id","person_id","transaction_type","transaction_date","period_start","period_end","amount","currency_code","reference_type","reference_id","status","notes","recorded_by","created_at"],
  Observations: ["observation_id","farm_id","field_id","plot_id","crop_cycle_id","observed_at","observer_id","category","severity","extent_value","extent_unit","quick_status","description","recommendation","resulting_task_id","evidence_file_id","recorded_by","created_at"],
  IrrigationRuns: ["irrigation_run_id","farm_id","site_id","water_source","pump_id","started_at","ended_at","duration_minutes","source_meter_start","source_meter_end","meter_unit","total_volume","volume_unit","recorded_by","notes","created_at"],
  IrrigationOperations: ["irrigation_operation_id","irrigation_run_id","farm_id","field_id","plot_id","valve_code","started_at","ended_at","duration_minutes","estimated_volume","volume_unit","method","recorded_by","notes","created_at"],
  Applications: ["application_id","farm_id","field_id","plot_id","crop_cycle_id","application_type","applied_at","item_id","batch_id","dose_quantity","dose_unit","water_volume","water_unit","treated_area","area_unit","target","weather_notes","actual_consumption","consumption_unit","recorded_by","notes","created_at"],
  Suppliers: ["supplier_id","supplier_name","contact_name","phone","email","address","tax_reference","payment_terms","status","created_at","updated_at"],
  InventoryItems: ["item_id","item_name","item_code","item_category","base_unit","reorder_level","reorder_unit","default_storage_location","valuation_method","status","created_at","updated_at"],
  ProcurementOrders: ["procurement_id","farm_id","supplier_id","document_number","order_date","expected_date","received_date","status","currency_code","subtotal","tax_amount","total_amount","notes","created_by","created_at","updated_at"],
  ProcurementLines: ["procurement_line_id","procurement_id","item_id","description","quantity_ordered","quantity_received","unit","unit_cost","currency_code","storage_location","lot_code","expiry_date"],
  StockLots: ["lot_id","farm_id","item_id","lot_code","source_type","source_reference","received_date","expiry_date","storage_location","supplier_id","unit_cost","currency_code","status","created_at","updated_at"],
  InventoryTransactions: ["transaction_id","farm_id","item_id","lot_id","transaction_type","quantity","unit","unit_cost","transaction_at","from_location","to_location","reference_type","reference_id","idempotency_key","recorded_by","reason","created_at"],
  FarmMadeBatches: ["batch_id","farm_id","batch_name","batch_type","start_date","ready_date","quantity_produced","unit","status","method_notes","recorded_by","created_at","updated_at"],
  FarmMadeBatchInputs: ["batch_input_id","batch_id","item_id","source_lot_id","quantity_used","unit","created_at"],
  HarvestSessions: ["harvest_id","farm_id","field_id","plot_id","crop_cycle_id","harvest_date","start_time","end_time","harvest_team","status","notes","recorded_by","created_at","updated_at"],
  HarvestLines: ["harvest_line_id","harvest_id","crop_id","variety_id","grade","quantity","unit","disposition","produce_lot_id","line_reference_key","notes"],
  ProduceLots: ["produce_lot_id","farm_id","crop_id","variety_id","source_plot_id","source_cycle_id","lot_code","grade","quantity_available","unit","harvest_date","storage_location","quality_status","status","created_at","updated_at"],
  ProduceLotMovements: ["produce_lot_movement_id","produce_lot_id","movement_type","quantity","unit","occurred_at","reference_type","reference_id","idempotency_key","recorded_by","reason","created_at"],
  PackhouseOperations: ["packhouse_operation_id","produce_lot_id","operation_type","operation_date","input_quantity","output_quantity","unit","loss_quantity","notes","recorded_by","created_at"],
  Customers: ["customer_id","customer_name","customer_type","contact_name","phone","email","billing_address","delivery_address","payment_terms","status","created_at","updated_at"],
  Products: ["product_id","product_name","product_category","crop_id","variety_id","grade","base_unit","default_price","currency_code","status","created_at","updated_at"],
  PriceLists: ["price_list_id","price_list_name","customer_type","currency_code","valid_from","valid_to","status","created_at","updated_at"],
  PriceListLines: ["price_line_id","price_list_id","product_id","unit_price","minimum_quantity","unit","created_at","updated_at"],
  SalesOrders: ["sales_order_id","farm_id","customer_id","external_order_id","order_number","order_channel","order_date","required_date","status","currency_code","subtotal","discount_amount","tax_amount","total_amount","notes","created_by","created_at","updated_at"],
  SalesOrderLines: ["sales_line_id","sales_order_id","product_id","produce_lot_id","description","quantity_ordered","quantity_fulfilled","unit","unit_price","line_total","grade"],
  Fulfilments: ["fulfilment_id","sales_order_id","fulfilment_date","fulfilment_reference","status","delivery_method","delivery_reference","notes","recorded_by","created_at"],
  FulfilmentLines: ["fulfilment_line_id","fulfilment_id","sales_line_id","produce_lot_id","quantity","unit","idempotency_key","created_at"],
  InvoiceLines: ["invoice_line_id","invoice_id","sales_line_id","product_id","description","quantity","unit","unit_price","line_total","created_at"],
  Dispatches: ["dispatch_id","fulfilment_id","dispatch_date","vehicle_reference","tracking_reference","received_by","status","notes","created_at"],
  Invoices: ["invoice_id","farm_id","customer_id","sales_order_id","invoice_number","invoice_date","due_date","status","currency_code","subtotal","tax_amount","total_amount","created_at","updated_at"],
  Payments: ["payment_id","farm_id","customer_id","invoice_id","payment_date","amount","currency_code","payment_method","account_id","reference_number","status","notes","recorded_by","created_at"],
  SalesReturns: ["return_id","farm_id","sales_order_id","customer_id","return_date","reason","status","recorded_by","created_at"],
  SalesReturnLines: ["return_line_id","return_id","product_id","quantity","unit","disposition","produce_lot_id","notes"],
  FinanceEntries: ["finance_entry_id","farm_id","entry_date","entry_type","category","description","amount","currency_code","payment_account","reference_type","reference_id","cost_class","status","recorded_by","created_at"],
  PaymentAccounts: ["account_id","farm_id","account_name","account_type","opening_balance","currency_code","status","created_at","updated_at"],
  CostAllocations: ["allocation_id","finance_entry_id","farm_id","crop_cycle_id","field_id","plot_id","allocation_basis","allocation_value","allocated_amount","currency_code","notes","created_at"],
  Assets: ["asset_id","farm_id","asset_name","asset_category","asset_code","purchase_date","purchase_cost","currency_code","current_status","site_id","field_id","custodian_id","notes","created_at","updated_at"],
  AssetUsage: ["asset_usage_id","asset_id","usage_date","person_id","crop_cycle_id","task_id","hours_used","fuel_quantity","fuel_unit","notes","recorded_by","created_at"],
  Maintenance: ["maintenance_id","asset_id","maintenance_type","scheduled_date","completed_date","cost","currency_code","downtime_hours","service_provider","parts_json","notes","status","created_at"],
  CalendarEvents: ["event_id","farm_id","title","event_type","start_at","end_at","all_day","site_id","field_id","description","recurrence_type","recurrence_interval","recurrence_end","occurrence_limit","series_id","status","created_by","created_at","updated_at"],
  EventParticipants: ["participant_id","event_id","person_id","user_id","attendance_status","created_at","updated_at"],
  ActivityJournal: ["journal_id","farm_id","occurred_at","category","title","description","author_id","linked_entity_type","linked_entity_id","evidence_file_id","created_at"],
  Attachments: ["attachment_id","farm_id","entity_type","entity_id","drive_file_id","file_name","mime_type","uploaded_by","created_at"],
  Notifications: ["notification_id","user_id","farm_id","event_type","title","message","reference_type","reference_id","created_at","read_at","delivery_status"],
  DemandRecords: ["demand_id","farm_id","customer_id","product_id","crop_id","variety_id","demand_type","quantity","unit","required_date","period_start","period_end","confidence","source_reference","status","created_by","created_at","updated_at"],
  ForecastVersions: ["forecast_version_id","farm_id","version_date","period_start","period_end","assumptions_json","coverage_json","confidence_label","created_by","created_at"],
  SavedViews: ["saved_view_id","user_id","farm_id","module_key","view_name","filters_json","sort_json","created_at","updated_at"],
  IdempotencyKeys: ["idempotency_key","operation_type","result_id","created_at"],
  AuditLog: ["audit_id","entity_type","entity_id","action","actor_user_id","occurred_at","change_summary"]
});

const ERP_KEYS = Object.freeze({
  Organizations:"organization_id",Users:"user_id",Roles:"role_id",UserRoles:"user_role_id",Teams:"team_id",TeamMembers:"team_member_id",OrganizationUsers:"organization_user_id",FarmMemberships:"farm_membership_id",FarmSettings:"farm_setting_id",
  Farms:"farm_id",Sites:"site_id",Fields:"field_id",Plots:"plot_id",Beds:"bed_id",Infrastructure:"infrastructure_id",
  Units:"unit_id",Crops:"crop_id",Varieties:"variety_id",CropProfiles:"crop_profile_id",PlantingCampaigns:"campaign_id",
  PlantingPlans:"planting_plan_id",CropCycles:"crop_cycle_id",CropCycleEvents:"cycle_event_id",TaskTemplates:"template_id",
  Tasks:"task_id",TaskAssignments:"assignment_id",TaskExecution:"execution_id",People:"person_id",Attendance:"attendance_id",
  WageTransactions:"wage_transaction_id",Observations:"observation_id",IrrigationRuns:"irrigation_run_id",
  IrrigationOperations:"irrigation_operation_id",Applications:"application_id",Suppliers:"supplier_id",
  InventoryItems:"item_id",ProcurementOrders:"procurement_id",ProcurementLines:"procurement_line_id",StockLots:"lot_id",
  FarmMadeBatches:"batch_id",FarmMadeBatchInputs:"batch_input_id",HarvestSessions:"harvest_id",HarvestLines:"harvest_line_id",
  ProduceLots:"produce_lot_id",ProduceLotMovements:"produce_lot_movement_id",PackhouseOperations:"packhouse_operation_id",Customers:"customer_id",Products:"product_id",
  PriceLists:"price_list_id",PriceListLines:"price_line_id",SalesOrders:"sales_order_id",SalesOrderLines:"sales_line_id",
  Fulfilments:"fulfilment_id",FulfilmentLines:"fulfilment_line_id",InvoiceLines:"invoice_line_id",Dispatches:"dispatch_id",Invoices:"invoice_id",
  Payments:"payment_id",SalesReturns:"return_id",SalesReturnLines:"return_line_id",FinanceEntries:"finance_entry_id",
  PaymentAccounts:"account_id",CostAllocations:"allocation_id",Assets:"asset_id",AssetUsage:"asset_usage_id",
  Maintenance:"maintenance_id",CalendarEvents:"event_id",EventParticipants:"participant_id",ActivityJournal:"journal_id",
  Attachments:"attachment_id",Notifications:"notification_id",DemandRecords:"demand_id",ForecastVersions:"forecast_version_id",
  SavedViews:"saved_view_id"
});

const ERP_LEDGER_REQUIRED = Object.freeze({\n  InventoryTransactions:["farm_id","item_id","transaction_type","quantity","unit","transaction_at"],\n  FinanceEntries:["farm_id","entry_date","entry_type","category","amount"],\n  Payments:["farm_id","payment_date","amount","currency_code","payment_method"],\n  WageTransactions:["farm_id","person_id","transaction_type","transaction_date","amount"],\n  TaskExecution:["task_id","person_id","started_at"],\n  HarvestLines:["harvest_id","crop_id","quantity","unit"],\n  ProduceLotMovements:["produce_lot_id","movement_type","quantity","unit","occurred_at"],\n  Attendance:["farm_id","person_id","work_date","attendance_status"],\n  IrrigationOperations:["irrigation_run_id","farm_id","plot_id","started_at"]\n});\n\nconst ERP_REQUIRED = Object.freeze({
  Farms:["farm_name","farm_code"],Sites:["farm_id","site_name"],Fields:["farm_id","field_name"],
  Plots:["farm_id","field_id","plot_name"],Beds:["farm_id","plot_id","bed_name"],
  Infrastructure:["farm_id","infrastructure_type","name"],Units:["unit_name","unit_symbol","dimension"],
  Crops:["crop_name"],Varieties:["crop_id","variety_name"],CropProfiles:["crop_id","production_system"],
  PlantingCampaigns:["farm_id","campaign_name"],PlantingPlans:["farm_id","plot_id","crop_id","target_planting_date"],
  CropCycles:["farm_id","plot_id","crop_id","start_date"],TaskTemplates:["template_name","task_type"],
  Tasks:["farm_id","title"],TaskAssignments:["task_id"],People:["display_name"],Teams:["farm_id","team_name"],
  Attendance:["farm_id","person_id","work_date","attendance_status"],Observations:["farm_id","plot_id","observed_at","category"],
  IrrigationRuns:["farm_id","started_at"],IrrigationOperations:["irrigation_run_id","farm_id","plot_id","started_at"],
  Applications:["farm_id","plot_id","applied_at","application_type"],
  Suppliers:["supplier_name"],InventoryItems:["item_name","base_unit"],ProcurementOrders:["farm_id","supplier_id","order_date"],
  ProcurementLines:["procurement_id","item_id","quantity_ordered"],StockLots:["item_id","lot_code","received_date"],
  FarmMadeBatches:["farm_id","batch_name","start_date"],HarvestSessions:["farm_id","plot_id","crop_cycle_id","harvest_date"],
  ProduceLots:["farm_id","crop_id","lot_code","quantity_available"],PackhouseOperations:["produce_lot_id","operation_type"],
  Customers:["customer_name"],Products:["product_name","base_unit"],PriceLists:["price_list_name","currency_code"],
  PriceListLines:["price_list_id","product_id","unit_price"],SalesOrders:["farm_id","customer_id","order_date"],
  SalesOrderLines:["sales_order_id","product_id","quantity_ordered"],Fulfilments:["sales_order_id","fulfilment_date"],FulfilmentLines:["fulfilment_id","sales_line_id","produce_lot_id"],InvoiceLines:["invoice_id","sales_line_id"],
  FulfilmentLines:["fulfilment_id","sales_line_id","quantity"],Dispatches:["fulfilment_id","dispatch_date"],
  Invoices:["farm_id","customer_id","invoice_number","invoice_date","total_amount"],PaymentAccounts:["farm_id","account_name"],
  CostAllocations:["finance_entry_id","farm_id","allocation_basis","allocated_amount"],Assets:["farm_id","asset_name"],
  AssetUsage:["asset_id","usage_date"],Maintenance:["asset_id","maintenance_type","scheduled_date"],
  CalendarEvents:["farm_id","title","start_at"],ActivityJournal:["farm_id","occurred_at","title"],
  DemandRecords:["farm_id","demand_type","quantity","required_date"],ForecastVersions:["farm_id","version_date"]
});

const ERP_RELATIONS = Object.freeze({
  organization_id:"Organizations",farm_id:"Farms",site_id:"Sites",field_id:"Fields",plot_id:"Plots",bed_id:"Beds",
  crop_id:"Crops",variety_id:"Varieties",crop_profile_id:"CropProfiles",campaign_id:"PlantingCampaigns",
  crop_cycle_id:"CropCycles",parent_cycle_id:"CropCycles",template_id:"TaskTemplates",event_id:"CalendarEvents",
  task_id:"Tasks",person_id:"People",observer_id:"People",user_id:"Users",role_id:"Roles",team_id:"Teams",
  resulting_task_id:"Tasks",team_leader_id:"People",item_id:"InventoryItems",product_item_id:"InventoryItems",lot_id:"StockLots",
  source_lot_id:"StockLots",supplier_id:"Suppliers",customer_id:"Customers",product_id:"Products",
  price_list_id:"PriceLists",sales_order_id:"SalesOrders",sales_line_id:"SalesOrderLines",produce_lot_id:"ProduceLots",
  fulfilment_id:"Fulfilments",invoice_id:"Invoices",account_id:"PaymentAccounts",finance_entry_id:"FinanceEntries",
  asset_id:"Assets",custodian_id:"People",irrigation_run_id:"IrrigationRuns",harvest_id:"HarvestSessions",
  procurement_id:"ProcurementOrders",batch_id:"FarmMadeBatches"
});

const ERP_UNIQUE_FIELDS = Object.freeze({
  Farms:["farm_code"],Sites:["farm_id","site_code"],Fields:["farm_id","field_code"],
  Plots:["field_id","plot_code"],Beds:["plot_id","bed_code"],Crops:["crop_name"],
  Varieties:["crop_id","variety_name"],Users:["email"],InventoryItems:["item_code"],
  Customers:["customer_name","phone"],Suppliers:["supplier_name","phone"],Products:["product_name","grade"],
  Tasks:["crop_cycle_id","template_id","due_at"]
});

function erpEnsureSchema_() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss) throw new Error("FarmERP database spreadsheet is unavailable.");
  const created=[], appended=[];
  Object.keys(ERP_TABLES).forEach(name=>{
    let sh=ss.getSheetByName(name);
    if(!sh){
      sh=ss.insertSheet(name);
      sh.getRange(1,1,1,ERP_TABLES[name].length).setValues([ERP_TABLES[name]]);
      sh.setFrozenRows(1);
      created.push(name);
      return;
    }
    const last=sh.getLastColumn();
    const headers=last?sh.getRange(1,1,1,last).getDisplayValues()[0].filter(String):[];
    const missing=ERP_TABLES[name].filter(h=>headers.indexOf(h)<0);
    if(missing.length){
      sh.getRange(1,last+1,1,missing.length).setValues([missing]);
      if(sh.getFrozenRows()<1) sh.setFrozenRows(1);
      appended.push({table:name,columns:missing});
    }
  });
  let versionSheet=ss.getSheetByName("SchemaInfo");
  if(!versionSheet){
    versionSheet=ss.insertSheet("SchemaInfo");
    versionSheet.getRange(1,1,1,3).setValues([["schema_version","installed_at","app_version"]]);
    versionSheet.appendRow([ERP_SCHEMA_VERSION,new Date(),ERP_VERSION]);
    versionSheet.setFrozenRows(1);
    created.push("SchemaInfo");
  }else{
    const vh=versionSheet.getRange(1,1,1,versionSheet.getLastColumn()).getDisplayValues()[0];
    const vc=vh.indexOf("schema_version")+1,ac=vh.indexOf("app_version")+1;
    if(vc&&ac&&versionSheet.getLastRow()>=2){
      versionSheet.getRange(2,vc).setValue(ERP_SCHEMA_VERSION);
      versionSheet.getRange(2,ac).setValue(ERP_VERSION);
    }
  }
  return {created:created,appended:appended};
}

/** Application bootstrap. Performs only additive schema installation, never creates farm data. */
function erpBootstrap() {
  const installed=erpEnsureSchema_();
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const actor=erpActor_();
  const farms=erpRead_("Farms",{limit:500}).rows;
  const settings=erpRead_("FarmSettings",{limit:1000}).rows;
  const modules=[
    {key:"dashboard",label:"Dashboard",group:"Overview"},
    {key:"calendar",label:"Calendar & journal",group:"Overview"},
    {key:"farms",label:"Farm structure",group:"Farm setup"},
    {key:"masters",label:"Master data",group:"Farm setup"},
    {key:"demand",label:"Demand & production plan",group:"Production"},
    {key:"crops",label:"Crop cycles",group:"Production"},
    {key:"tasks",label:"Tasks & workforce",group:"Operations"},
    {key:"scouting",label:"Scouting & observations",group:"Operations"},
    {key:"irrigation",label:"Irrigation & applications",group:"Operations"},
    {key:"inventory",label:"Inventory & procurement",group:"Supply"},
    {key:"harvest",label:"Harvest & post-harvest",group:"Supply"},
    {key:"sales",label:"Customers & sales",group:"Commercial"},
    {key:"finance",label:"Finance & profitability",group:"Commercial"},
    {key:"assets",label:"Assets & maintenance",group:"Resources"},
    {key:"reports",label:"Reports & analytics",group:"Management"},
    {key:"settings",label:"Settings & access",group:"Management"}
  ];
  return {ok:true,appVersion:ERP_VERSION,schemaVersion:ERP_SCHEMA_VERSION,databaseName:ss.getName(),
    actor:actor,farms:farms,settings:settings,modules:modules,createdTables:installed.created,
    appendedColumns:installed.appended,serverTime:new Date().toISOString()};
}

function erpActor_(){
  let email="";
  try{email=Session.getActiveUser().getEmail()||"";}catch(e){}
  if(!email){try{email=Session.getEffectiveUser().getEmail()||"";}catch(e){}}
  return email||"owner-session";
}

/** Generic list, server filtered and paged. */
function erpList(table,options){
  if(!ERP_TABLES[table]&&!TABLE_SCHEMAS[table]&&!MULTI_FARM_TABLE_SCHEMAS[table]) throw new Error("Unsupported table.");
  return erpRead_(table,options||{});
}

function erpRead_(table,options){
  const ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName(table);
  if(!sh||sh.getLastRow()<2)return {table:table,rows:[],total:0,headers:sh?sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0]:[]};
  const lastRow=sh.getLastRow(),lastCol=sh.getLastColumn();
  const headers=sh.getRange(1,1,1,lastCol).getDisplayValues()[0];
  const limit=Math.min(1000,Math.max(1,Number(options.limit)||200));
  const values=sh.getRange(2,1,lastRow-1,lastCol).getValues();
  let rows=values.map(row=>{const o={};headers.forEach((h,i)=>{if(h)o[h]=erpValue_(row[i]);});return o;})
    .filter(o=>Object.values(o).some(v=>v!==""&&v!==null));
  if(options.farmId)rows=rows.filter(o=>String(o.farm_id||"")===String(options.farmId));
  if(options.filter&&typeof options.filter==="object")rows=rows.filter(o=>Object.keys(options.filter).every(k=>String(o[k]??"")===String(options.filter[k])));
  if(options.search){const q=String(options.search).toLowerCase();rows=rows.filter(o=>Object.values(o).some(v=>String(v??"").toLowerCase().includes(q)));}
  if(options.sortBy){const k=options.sortBy;const dir=options.sortDir==="desc"?-1:1;rows.sort((a,b)=>String(a[k]??"").localeCompare(String(b[k]??""),undefined,{numeric:true})*dir);}
  const total=rows.length,offset=Math.max(0,Number(options.offset)||0);
  rows=rows.slice(offset,offset+limit);
  return {table:table,headers:headers,rows:rows,total:total,offset:offset,limit:limit};
}

function erpValue_(v){return v instanceof Date?v.toISOString():v;}

function erpValidateRelations_(record){
  Object.keys(ERP_RELATIONS).forEach(field=>{
    const value=record[field];
    if(value===undefined||value===null||String(value)==="")return;
    const target=ERP_RELATIONS[field],targetKey=ERP_KEYS[target];
    if(!targetKey)return;
    const matches=erpRead_(target,{limit:1000,filter:{[targetKey]:String(value)}}).rows;
    if(!matches.length)throw new Error("Referenced "+field+" record was not found.");
  });
}

function erpValidateRecord_(table,record,id){
  (ERP_REQUIRED[table]||[]).forEach(field=>{
    if(record[field]===undefined||record[field]===null||String(record[field]).trim()===""){
      throw new Error("Required field: "+field);
    }
  });
  erpValidateRelations_(record);
  const unique=ERP_UNIQUE_FIELDS[table]||[];
  if(unique.length&&unique.every(f=>record[f]!==undefined&&record[f]!==null&&String(record[f]).trim()!=="")){
    const current=ERP_KEYS[table];
    const existing=erpRead_(table,{limit:1000}).rows;
    const duplicate=existing.find(r=>String(r[current])!==String(id)&&unique.every(f=>String(r[f]??"").trim().toLowerCase()===String(record[f]).trim().toLowerCase()));
    if(duplicate)throw new Error("A record with the same "+unique.map(label=>label.replace(/_/g," ")).join(" + ")+" already exists.");
  }
  Object.keys(record).forEach(field=>{
    const value=record[field];
    if(value===""||value===null||value===undefined)return;
    if(/quantity|amount|cost|price|rate|area|duration|minutes|hours|volume|percent|spacing|days|count|balance|threshold|factor|plant_count|survival|germination|discount|tax|subtotal|total|yield|meter|downtime|contribution|offset|interval|width|length|height/i.test(field)){
      if(!isFinite(Number(value)))throw new Error(field+" must be numeric.");
      if(/percent|rate|survival|germination|contribution/i.test(field)&&Number(value)<0)throw new Error(field+" cannot be negative.");
    }
  });
}

/** Generic master/planning record create/update. Posted ledgers use dedicated services. */
function erpSave(table,record){
  if(!ERP_KEYS[table])throw new Error("This record type is not editable through the generic service.");
  if(!record||typeof record!=="object"||Array.isArray(record))throw new Error("Record data is required.");
  return erpWithLock_(()=>{
    const ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName(table);
    if(!sh)throw new Error("Table is not installed: "+table);
    const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
    const key=ERP_KEYS[table],allowed=new Set(headers);
    Object.keys(record).forEach(k=>{if(!allowed.has(k))throw new Error("Unknown field "+k+" for "+table);});
    const id=String(record[key]||Utilities.getUuid());
    const keyCol=headers.indexOf(key)+1;
    if(!keyCol)throw new Error("Primary key is missing: "+key);
    const last=sh.getLastRow();let rowNum=0;
    if(last>=2){const ids=sh.getRange(2,keyCol,last-1,1).getDisplayValues().flat();const i=ids.indexOf(id);if(i>=0)rowNum=i+2;}
    const isUpdate=!!rowNum;
    const old=isUpdate?sh.getRange(rowNum,1,1,headers.length).getValues()[0]:new Array(headers.length).fill("");
    const before=erpObject_(headers,old);
    const merged=Object.assign({},before,record);
    erpValidateRecord_(table,merged,id);
    const now=new Date();
    const values=headers.map((h,i)=>{
      if(Object.prototype.hasOwnProperty.call(record,h))return erpCoerce_(record[h]);
      if(!isUpdate&&h===key)return id;
      if(!isUpdate&&h==="created_at")return now;
      if(h==="updated_at")return now;
      return old[i];
    });
    if(isUpdate)sh.getRange(rowNum,1,1,headers.length).setValues([values]);
    else sh.appendRow(values);
    erpAudit_(table,id,isUpdate?"update":"create",before,record);
    return {ok:true,table:table,id:id,created:!isUpdate,record:erpObject_(headers,values)};
  });
}

function erpArchive(table,id,reason){
  if(!ERP_ARCHIVABLE.has(table))throw new Error("This record type must be corrected or cancelled through its own workflow, not archived.");
  const data=erpList(table,{limit:1000,filter:{[ERP_KEYS[table]]:id}});
  if(!data.rows.length)throw new Error("Record not found.");
  const record=data.rows[0];
  if(!("status" in record))throw new Error("This record type cannot be archived.");
  record.status="inactive";
  if("notes" in record)record.notes=[record.notes,reason||"Archived by user"].filter(Boolean).join(" | ");
  return erpSave(table,record);
}

function erpObject_(headers,values){const o={};headers.forEach((h,i)=>o[h]=erpValue_(values[i]));return o;}
function erpCoerce_(v){if(v===null||v===undefined)return "";if(typeof v==="object"&&v.dateValue)return new Date(v.dateValue);return v;}

function erpWithLock_(fn){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))throw new Error("FarmERP is processing another update. Please retry.");
  try{return fn();}finally{lock.releaseLock();}
}

function erpAudit_(type,id,action,before,after){
  const ss=SpreadsheetApp.getActiveSpreadsheet(),sh=ss.getSheetByName("AuditLog");
  if(!sh)return;
  const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  const data={audit_id:Utilities.getUuid(),entity_type:type,entity_id:id,action:action,
    actor_user_id:erpActor_(),occurred_at:new Date(),change_summary:JSON.stringify({before:before,after:after})};
  sh.appendRow(headers.map(h=>Object.prototype.hasOwnProperty.call(data,h)?data[h]:""));
}

/** Idempotent append-only ledger operation. A key is mandatory for retryable writes. */
function erpPostLedger(table,record,idempotencyKey){
  const allowed=["InventoryTransactions","FinanceEntries","Payments","WageTransactions","IrrigationOperations","TaskExecution","HarvestLines","Attendance","ProduceLotMovements"];
  if(allowed.indexOf(table)<0)throw new Error("Unsupported ledger.");
  if(!idempotencyKey)throw new Error("An idempotency key is required.");
  if(!record||typeof record!=="object")throw new Error("Record data is required.");
  return erpWithLock_(()=>{
    const ss=SpreadsheetApp.getActiveSpreadsheet(),keys=ss.getSheetByName("IdempotencyKeys");
    const prior=keys.getLastRow()>=2?keys.getRange(2,1,keys.getLastRow()-1,1).getDisplayValues().flat():[];
    const pos=prior.indexOf(idempotencyKey);
    if(pos>=0){const keyRow=keys.getRange(pos+2,1,1,4).getValues()[0];return {ok:true,duplicate:true,id:keyRow[2]};}
    const sh=ss.getSheetByName(table),headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
    const unknown=Object.keys(record).filter(k=>headers.indexOf(k)<0);
    if(unknown.length)throw new Error("Unknown ledger fields: "+unknown.join(", "));
    const now=new Date(),id=Utilities.getUuid(),data=Object.assign({},record);
    const idField=ERP_KEYS[table]||({InventoryTransactions:"transaction_id",FinanceEntries:"finance_entry_id",Payments:"payment_id",WageTransactions:"wage_transaction_id",IrrigationOperations:"irrigation_operation_id",TaskExecution:"execution_id",HarvestLines:"harvest_line_id",Attendance:"attendance_id",ProduceLotMovements:"produce_lot_movement_id"})[table];
    data[idField]=id;if(!data.created_at)data.created_at=now;
    if(headers.indexOf("recorded_by")>=0&&!data.recorded_by)data.recorded_by=erpActor_();
    if(headers.indexOf("idempotency_key")>=0)data.idempotency_key=idempotencyKey;
    const required=ERP_LEDGER_REQUIRED[table]||[];
    const missing=required.filter(k=>data[k]===undefined||data[k]===null||String(data[k]).trim()==="");
    if(missing.length)throw new Error("Required fields: "+missing.join(", "));
    erpValidateRelations_(data);
    if(data.quantity!==undefined&&(!(Number(data.quantity)>0)||!isFinite(Number(data.quantity))))throw new Error("Quantity must be greater than zero.");
    if(table==="InventoryTransactions"&&["issue","sale","wastage","production_out","adjustment_out"].includes(String(data.transaction_type||"").toLowerCase())){
      const available=erpStockBalance(data.item_id,data.lot_id);
      if(available<Number(data.quantity))throw new Error("Insufficient available stock. Available: "+available);
    }
    sh.appendRow(headers.map(h=>Object.prototype.hasOwnProperty.call(data,h)?erpCoerce_(data[h]):""));
    keys.appendRow([idempotencyKey,table,id,now]);
    erpAudit_(table,id,"post",{},data);
    return {ok:true,duplicate:false,id:id};
  });
}

function erpStockBalance(itemId,lotId){
  const rows=erpRead_("InventoryTransactions",{limit:1000}).rows.filter(r=>String(r.item_id)===String(itemId)&&(!lotId||String(r.lot_id)===String(lotId)));
  return rows.reduce((sum,r)=>sum+erpSignedStock_(r.transaction_type,Number(r.quantity)||0),0);
}
function erpSignedStock_(type,q){
  const t=String(type||"").toLowerCase();
  if(["receipt","return_in","production_in","adjustment_in"].includes(t))return q;
  if(["issue","sale","wastage","quarantine_out","production_out","adjustment_out"].includes(t))return -q;
  return 0;
}

function erpGetDashboard(farmId){
  const today=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyy-MM-dd");
  const tasks=erpRead_("Tasks",{limit:1000,farmId:farmId}).rows;
  const obs=erpRead_("Observations",{limit:1000,farmId:farmId}).rows;
  const orders=erpRead_("SalesOrders",{limit:1000,farmId:farmId}).rows;
  const cycles=erpRead_("CropCycles",{limit:1000,farmId:farmId}).rows;
  const items=erpRead_("InventoryItems",{limit:1000}).rows;
  const tx=erpRead_("InventoryTransactions",{limit:1000,farmId:farmId}).rows;
  const open=tasks.filter(t=>!["completed","cancelled"].includes(String(t.status||"").toLowerCase()));
  const due=open.filter(t=>String(t.due_at||"").slice(0,10)===today);
  const overdue=open.filter(t=>t.due_at&&String(t.due_at).slice(0,10)<today);
  const action=obs.filter(o=>String(o.quick_status||"").toLowerCase()==="action required");
  const pendingOrders=orders.filter(o=>!["completed","cancelled","closed"].includes(String(o.status||"").toLowerCase()));
  const lowStock=items.map(i=>({item:i,balance:tx.filter(t=>t.item_id===i.item_id).reduce((s,t)=>s+erpSignedStock_(t.transaction_type,Number(t.quantity)||0),0)}))
    .filter(x=>Number(x.item.reorder_level)>0&&x.balance<=Number(x.item.reorder_level));
  return {ok:true,generatedAt:new Date().toISOString(),today:today,
    metrics:{openTasks:open.length,dueToday:due.length,overdue:overdue.length,actionRequired:action.length,
      activeCropCycles:cycles.filter(c=>!["terminated","completed","cancelled"].includes(String(c.status||"").toLowerCase())).length,
      openOrders:pendingOrders.length,lowStockItems:lowStock.length},
    dueTasks:due.slice(0,10),overdueTasks:overdue.slice(0,10),actionObservations:action.slice(0,10),
    lowStock:lowStock.slice(0,10),recentOrders:pendingOrders.slice(-8).reverse()};
}

function erpGetSchema(){
  return {ok:true,tables:ERP_TABLES,keys:ERP_KEYS,required:ERP_REQUIRED,ledgerRequired:ERP_LEDGER_REQUIRED};
}

const ERP_ARCHIVABLE = new Set([
  "Users","Roles","Farms","Sites","Fields","Plots","Beds","Infrastructure","Units","Crops",
  "Varieties","CropProfiles","People","Teams","Suppliers","InventoryItems","Customers",
  "Products","PriceLists","Assets"
]);

function erpGetModuleData(table,options){return erpList(table,options);}
function erpCsv(table){
  const d=erpList(table,{limit:1000}),rows=[d.headers].concat(d.rows.map(r=>d.headers.map(h=>r[h]??"")));
  return rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\r\n");
}
function erpGetSchema(){return {ok:true,tables:ERP_TABLES,keys:ERP_KEYS,required:ERP_REQUIRED};}
