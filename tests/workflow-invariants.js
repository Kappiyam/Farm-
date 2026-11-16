const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
let uuid = 0;

class FakeRange {
  constructor(sheet,row,col,rows,cols){Object.assign(this,{sheet,row,col,rows,cols});}
  getValues(){
    const out=[];
    for(let r=0;r<this.rows;r++){
      const line=[];
      for(let c=0;c<this.cols;c++)line.push((this.sheet.data[this.row-1+r]||[])[this.col-1+c]??"");
      out.push(line);
    }
    return out;
  }
  getDisplayValues(){return this.getValues().map(row=>row.map(v=>v instanceof Date?v.toISOString():String(v??"")));}
  getValue(){return this.getValues()[0][0];}
  getDisplayValue(){return this.getDisplayValues()[0][0];}
  setValues(values){
    values.forEach((line,r)=>line.forEach((value,c)=>{
      const rr=this.row-1+r,cc=this.col-1+c;
      while(this.sheet.data.length<=rr)this.sheet.data.push([]);
      while(this.sheet.data[rr].length<=cc)this.sheet.data[rr].push("");
      this.sheet.data[rr][cc]=value;
    }));
    return this;
  }
  setValue(value){return this.setValues([[value]]);}
}
class FakeSheet {
  constructor(name,headers){this.name=name;this.data=[headers.slice()];this.frozen=0;}
  getLastColumn(){return this.data.reduce((n,r)=>Math.max(n,r.length),0);}
  getLastRow(){return this.data.length;}
  getDataRange(){return new FakeRange(this,1,1,this.getLastRow(),Math.max(1,this.getLastColumn()));}
  getRange(r,c,nr=1,nc=1){return new FakeRange(this,r,c,nr,nc);}
  appendRow(row){this.data.push(row.slice());}
  setFrozenRows(n){this.frozen=n;}
  getFrozenRows(){return this.frozen;}
}
class FakeSpreadsheet {
  constructor(){this.sheets={};}
  getName(){return "FarmERP canonical test database";}
  getId(){return "FAKE-SPREADSHEET";}
  getSheetByName(name){return this.sheets[name]||null;}
  insertSheet(name){if(this.sheets[name])throw new Error("Sheet already exists: "+name);const s=new FakeSheet(name,[]);this.sheets[name]=s;return s;}
}
const ss=new FakeSpreadsheet();
const context={
  console,Date,Math,JSON,Object,Array,String,Number,Boolean,Set,Map,isFinite,parseInt,parseFloat,
  SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  Session:{getActiveUser:()=>({getEmail:()=>"test-owner@example.invalid"}),getEffectiveUser:()=>({getEmail:()=>"test-owner@example.invalid"}),getScriptTimeZone:()=>"Asia/Kolkata"},
  Utilities:{
    getUuid:()=>("test-uuid-"+(++uuid)),
    DigestAlgorithm:{SHA_256:"sha256"},
    Charset:{UTF_8:"utf8"},
    computeDigest:(algorithm,value)=>crypto.createHash("sha256").update(String(value)).digest(),
    base64Encode:value=>Buffer.from(value).toString("base64"),
    formatDate:(value,tz,format)=>{
      const d=value instanceof Date?value:new Date(value);
      const yyyy=d.getUTCFullYear(),mm=String(d.getUTCMonth()+1).padStart(2,"0"),dd=String(d.getUTCDate()).padStart(2,"0");
      const hh=String(d.getUTCHours()).padStart(2,"0"),mi=String(d.getUTCMinutes()).padStart(2,"0"),ss=String(d.getUTCSeconds()).padStart(2,"0");
      return String(format||"yyyy-MM-dd").replace("yyyy",String(yyyy)).replace("MM",mm).replace("dd",dd).replace("HH",hh).replace("mm",mi).replace("ss",ss);
    },
    parseDate:(value,tz,format)=>new Date(String(value).replace(/\'T\'/g,"T"))
  },
  CacheService:{getScriptCache:()=>({remove:()=>{},get:()=>null,put:()=>{}})},
  PropertiesService:{
    getScriptProperties:()=>{
      const values=context.__scriptProperties||(context.__scriptProperties={});
      return {getProperty:key=>Object.prototype.hasOwnProperty.call(values,key)?values[key]:null,
        setProperty:(key,value)=>{values[key]=String(value);return this;}};
    }
  }
};
vm.createContext(context);
const backendFiles=fs.readdirSync(path.join(root,"backend")).filter(f=>f.endsWith(".gs")).sort();
const source=backendFiles.map(f=>"\n// "+f+"\n"+fs.readFileSync(path.join(root,"backend",f),"utf8")).join("\n");
vm.runInContext(source,context,{filename:"FarmERP canonical Apps Script"});
const schema=vm.runInContext("ERP_TABLES",context);

function assert(ok,message){if(!ok)throw new Error(message);}
function throws(fn,message){
  let caught=null;try{fn();}catch(e){caught=e;}
  assert(!!caught,message+(caught?": "+caught.message:""));
}
function rows(table){return context.erpRead_(table,{limit:1000}).rows;}
function seed(table,record){
  const sh=ss.getSheetByName(table),headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  sh.appendRow(headers.map(h=>Object.prototype.hasOwnProperty.call(record,h)?record[h]:""));
  return rows(table).at(-1);
}
function save(table,record,key){return context.erpSave(table,record,key).record;}
function farm(code,name){
  return save("Farms",{farm_name:name,farm_code:code,country_code:"IN",timezone:"Asia/Kolkata",currency_code:"INR"});
}
function fieldAndPlot(farmId,code){
  const field=save("Fields",{farm_id:farmId,field_name:"Field "+code,field_code:code});
  const plot=save("Plots",{farm_id:farmId,field_id:field.field_id,plot_name:code+"1",plot_code:code+"1",status:"active"});
  return {field:field,plot:plot};
}

// The real canonical module set must install one consistent additive schema.
const installed=context.erpInstallSchema();
assert(installed.ok&&installed.tableCount>=70,"Canonical schema installation should create the full domain table set.");
assert(Object.keys(ss.sheets).length>=70,"All canonical database sheets must be created.");
assert(context.erpPreviewSchemaMigration().createTabs.length===0,"Schema preview should be clean after installation.");

// Stable generic-save keys must return the same record without adding a duplicate.
const farmRecord={farm_name:"Kappiyam test farm",farm_code:"FARM-1",country_code:"IN",timezone:"Asia/Kolkata",currency_code:"INR"};
const firstFarmCreate=context.erpSave("Farms",farmRecord,"farm-create-once");
const duplicateFarm=context.erpSave("Farms",farmRecord,"farm-create-once");
const farm1=firstFarmCreate.record;
assert(duplicateFarm.duplicate===true&&rows("Farms").length===1,"Generic save replay must return the original farm.");
const loc1=fieldAndPlot(farm1.farm_id,"A");

// Inventory issue: lot balance, plot scope and request replay.
const item=save("InventoryItems",{item_name:"Vermicompost",item_code:"VC-01",base_unit:"kg",status:"active"});
const openingLot=save("StockLots",{farm_id:farm1.farm_id,item_id:item.item_id,lot_code:"OPEN-01",received_date:"2026-11-15",storage_location:"Store",quantity_available:0,status:"active"});
const openingReceipt={farm_id:farm1.farm_id,item_id:item.item_id,lot_id:openingLot.lot_id,transaction_type:"receipt",
  quantity:10,unit:"kg",transaction_at:"2026-11-15T08:00:00.000Z",to_location:"Store",reference_type:"opening",reference_id:"OPEN-01"};
context.erpPostLedger("InventoryTransactions",openingReceipt,"opening-receipt-once");
context.erpIssueInventoryLot(openingLot.lot_id,3,loc1.plot.plot_id,"Basal application","Field A","issue-stock-once");
const issueReplay=context.erpIssueInventoryLot(openingLot.lot_id,3,loc1.plot.plot_id,"Basal application","Field A","issue-stock-once");
assert(issueReplay.duplicate===true,"Inventory issue replay must be recognised.");
assert(Number(rows("StockLots").find(x=>x.lot_id===openingLot.lot_id).quantity_available)===7,"Inventory issue must reduce the stock-lot balance once.");
assert(rows("InventoryTransactions").filter(x=>x.lot_id===openingLot.lot_id&&x.transaction_type==="issue").length===1,"Inventory issue must append one ledger movement.");
throws(()=>context.erpIssueInventoryLot(openingLot.lot_id,8,"","Over issue","Test","issue-over-stock"),"Issue quantity cannot exceed the lot balance.");
const farm2=farm("FARM-2","Other test farm");
const loc2=fieldAndPlot(farm2.farm_id,"B");
throws(()=>context.erpIssueInventoryLot(openingLot.lot_id,1,loc2.plot.plot_id,"Wrong farm","Test","issue-cross-farm"),"Stock cannot be issued to a plot in another farm.");

// Procurement receipt: batch totals are checked before writes and safe to replay.
const supplier=save("Suppliers",{supplier_name:"Test supplier",phone:"9000000001",status:"active"});
const procurement=save("ProcurementOrders",{farm_id:farm1.farm_id,supplier_id:supplier.supplier_id,order_date:"2026-11-15",status:"ordered",currency_code:"INR"});
const procurementLine=save("ProcurementLines",{procurement_id:procurement.procurement_id,item_id:item.item_id,description:"Vermicompost",
  quantity_ordered:10,quantity_received:0,unit:"kg",unit_cost:5,currency_code:"INR"});
const stockLotsBefore=rows("StockLots").length;
throws(()=>context.erpReceiveProcurement(procurement.procurement_id,[
  {procurement_line_id:procurementLine.procurement_line_id,quantity:6,lot_code:"BATCH-X",received_date:"2026-11-15"},
  {procurement_line_id:procurementLine.procurement_line_id,quantity:5,lot_code:"BATCH-Y",received_date:"2026-11-15"}
],"procurement-over-receipt"),"Over-receipt batch must be rejected as a whole.");
assert(rows("StockLots").length===stockLotsBefore,"Rejected procurement batch must not create stock lots.");
const receipts=[
  {procurement_line_id:procurementLine.procurement_line_id,quantity:4,lot_code:"BATCH-A",received_date:"2026-11-15"},
  {procurement_line_id:procurementLine.procurement_line_id,quantity:6,lot_code:"BATCH-A",received_date:"2026-11-15"}
];
context.erpReceiveProcurement(procurement.procurement_id,receipts,"procurement-receipt-once");
context.erpReceiveProcurement(procurement.procurement_id,receipts,"procurement-receipt-once");
assert(rows("StockLots").filter(x=>x.lot_code==="BATCH-A").length===1,"Same batch rows should aggregate to one stock lot.");
assert(Number(rows("ProcurementLines").find(x=>x.procurement_line_id===procurementLine.procurement_line_id).quantity_received)===10,"Receipt quantity should reconcile to the inventory ledger.");
// Produce traceability, fulfilment aggregation and invoice/payment lifecycle.
const crop=save("Crops",{crop_name:"Test papaya",crop_category:"fruit"});
const customer=save("Customers",{customer_name:"Test kitchen",phone:"9000000002",status:"active"});
const product=save("Products",{product_name:"Papaya",base_unit:"kg",crop_id:crop.crop_id,grade:"A",status:"active"});
const salesOrder=save("SalesOrders",{farm_id:farm1.farm_id,customer_id:customer.customer_id,order_date:"2026-11-15",
  order_number:"SO-TEST-01",currency_code:"INR",status:"confirmed"});
const salesLine=save("SalesOrderLines",{sales_order_id:salesOrder.sales_order_id,product_id:product.product_id,
  quantity_ordered:10,quantity_fulfilled:0,unit:"kg",unit_price:10,description:"Papaya grade A"});
const produceLot=save("ProduceLots",{farm_id:farm1.farm_id,crop_id:crop.crop_id,lot_code:"PRODUCE-01",
  quantity_available:0,unit:"kg",status:"active"});
context.erpPostLedger("ProduceLotMovements",{produce_lot_id:produceLot.produce_lot_id,movement_type:"receipt",
  quantity:10,unit:"kg",occurred_at:"2026-11-15T09:00:00.000Z",reference_type:"test_harvest",reference_id:"HARV-TEST"},
  "produce-receipt-once");
throws(()=>context.erpFulfilSalesOrder(salesOrder.sales_order_id,"FUL-OVER",[
  {sales_line_id:salesLine.sales_line_id,produce_lot_id:produceLot.produce_lot_id,quantity:6},
  {sales_line_id:salesLine.sales_line_id,produce_lot_id:produceLot.produce_lot_id,quantity:5}
],"2026-11-15","fulfilment-over"),"Fulfilment must reject aggregate quantity above ordered or available quantity.");
assert(rows("Fulfilments").length===0,"Rejected fulfilment batch must not create a fulfilment header.");
const fulfilmentLines=[
  {sales_line_id:salesLine.sales_line_id,produce_lot_id:produceLot.produce_lot_id,quantity:4,unit:"kg"},
  {sales_line_id:salesLine.sales_line_id,produce_lot_id:produceLot.produce_lot_id,quantity:6,unit:"kg"}
];
context.erpFulfilSalesOrder(salesOrder.sales_order_id,"FUL-ONCE",fulfilmentLines,"2026-11-15","fulfilment-once");
context.erpFulfilSalesOrder(salesOrder.sales_order_id,"FUL-ONCE",fulfilmentLines,"2026-11-15","fulfilment-once");
assert(rows("FulfilmentLines").length===1,"Repeated request lines for the same lot should aggregate and replay once.");
assert(Number(rows("SalesOrderLines")[0].quantity_fulfilled)===10,"Fulfilment should reconcile ordered-line fulfilled quantity.");
assert(Number(rows("ProduceLots")[0].quantity_available)===0,"Fulfilment should deduct produce-lot balance exactly once.");
const invoiceResult=context.erpCreateInvoiceFromOrder(salesOrder.sales_order_id,"2026-12-15","invoice-once");
context.erpCreateInvoiceFromOrder(salesOrder.sales_order_id,"2026-12-15","invoice-once");
assert(rows("Invoices").length===1&&rows("InvoiceLines").length===1,"Invoice creation replay must not duplicate invoice records.");
const invoice=invoiceResult.invoice;
throws(()=>context.erpRecordCustomerPayment(invoice.invoice_id,{amount:10,payment_date:"15-11-2026",payment_method:"cash"},"payment-bad-date"),
  "Payment date must be ISO YYYY-MM-DD.");
throws(()=>context.erpRecordCustomerPayment(invoice.invoice_id,{amount:10,payment_date:"2026-11-15",payment_method:"crypto"},"payment-bad-method"),
  "Unsupported payment methods must be rejected.");
const foreignAccount=save("PaymentAccounts",{farm_id:farm2.farm_id,account_name:"Other farm cash account",status:"active"});
throws(()=>context.erpRecordCustomerPayment(invoice.invoice_id,{amount:10,payment_date:"2026-11-15",payment_method:"cash",account_id:foreignAccount.account_id},"payment-cross-farm"),
  "Payment account from another farm must be rejected.");
assert(rows("Payments").length===0,"Rejected payment attempts must not create financial records.");
context.erpRecordCustomerPayment(invoice.invoice_id,{amount:10,payment_date:"2026-11-15",payment_method:"cash"},"payment-first");
context.erpRecordCustomerPayment(invoice.invoice_id,{amount:10,payment_date:"2026-11-15",payment_method:"cash"},"payment-first");
context.erpRecordCustomerPayment(invoice.invoice_id,{amount:90,payment_date:"2026-11-15",payment_method:"cash"},"payment-second");
context.erpRecordCustomerPayment(invoice.invoice_id,{amount:90,payment_date:"2026-11-15",payment_method:"cash"},"payment-second");
assert(rows("Payments").length===2,"Payment request replays must not duplicate payment rows.");
assert(Number(rows("Invoices")[0].paid_amount)===100&&Number(rows("Invoices")[0].balance_due)===0,"Invoice paid amount and balance must reconcile to customer payments.");

// Workforce: active team membership, assignment idempotency and measured contribution limits.
const worker1=save("People",{display_name:"Worker One",status:"active"});
const worker2=save("People",{display_name:"Worker Two",status:"active"});
const outsideWorker=save("People",{display_name:"Outside Worker",status:"active"});
const team=save("Teams",{farm_id:farm1.farm_id,team_name:"Field crew",status:"active"});
save("TeamMembers",{team_id:team.team_id,person_id:worker1.person_id,valid_from:"2026-11-01",status:"active"});
save("TeamMembers",{team_id:team.team_id,person_id:worker2.person_id,valid_from:"2026-11-01",status:"active"});
const task=save("Tasks",{farm_id:farm1.farm_id,title:"Irrigation line check",status:"planned",assigned_team:"Field crew",priority:"normal"});
throws(()=>context.erpAssignTask(task.task_id,[{person_id:outsideWorker.person_id}],"assign-outside"),"Workers without active membership must not be assigned.");
context.erpAssignTask(task.task_id,[{person_id:worker1.person_id}],"assign-once");
context.erpAssignTask(task.task_id,[{person_id:worker1.person_id}],"assign-once");
assert(rows("TaskAssignments").filter(x=>x.task_id===task.task_id).length===1,"Assignment replay must not duplicate task assignments.");
throws(()=>context.erpRecordTaskExecution(task.task_id,[{person_id:outsideWorker.person_id,quantity:1}],"execution-outside"),
  "Workers outside the farm team must not record execution.");
throws(()=>context.erpRecordTaskExecution(task.task_id,[
  {person_id:worker1.person_id,contribution_percent:60,duration_minutes:30},
  {person_id:worker2.person_id,contribution_percent:50,duration_minutes:30}
],"execution-over-contribution"),"Contribution percentages above 100 must be rejected.");
const execution=[{person_id:worker1.person_id,contribution_percent:60,quantity:2,quantity_unit:"kg",duration_minutes:60,notes:"Actual work"}];
context.erpRecordTaskExecution(task.task_id,execution,"execution-once");
context.erpRecordTaskExecution(task.task_id,execution,"execution-once");
assert(rows("TaskExecution").filter(x=>x.task_id===task.task_id).length===1,"Execution replay must not create duplicate actuals.");
assert(rows("Tasks").find(x=>x.task_id===task.task_id).status==="in_progress","Recorded actual work should move the task to in progress.");

// Demand-to-production planning nets approved supply and saveable stock before sizing new production.
const planCrop=save("Crops",{crop_name:"Planning test crop",crop_category:"vegetable",default_unit:"kg",status:"active"});
const planVariety=save("Varieties",{crop_id:planCrop.crop_id,variety_name:"Planning test variety",
  propagation_method:"direct_seed",duration_days:90,spacing_row:5,spacing_plant:2.5,spacing_unit:"ft",
  expected_yield:100,yield_unit:"kg",yield_basis:"per_area",yield_area_unit:"acre",status:"active"});
const planProfile=save("CropProfiles",{crop_id:planCrop.crop_id,variety_id:planVariety.variety_id,
  production_system:"open_field",propagation_method:"direct_seed",duration_days:90,germination_rate:0.8,
  survival_rate:0.9,expected_yield:100,yield_unit:"kg",yield_basis:"per_area",yield_area_unit:"acre",
  assumption_basis:"farm_history",resource_rates_json:JSON.stringify({
    loss_allowance_rate:0.1,
    compost_rate_per_area:{quantity:2,unit:"tonne",area_unit:"acre"},
    seed_lead_days:7,compost_lead_days:14
  }),status:"active"});
const planProduct=save("Products",{product_name:"Planning crop produce",crop_id:planCrop.crop_id,
  variety_id:planVariety.variety_id,base_unit:"kg",status:"active"});
const planStockLot=save("ProduceLots",{farm_id:farm1.farm_id,crop_id:planCrop.crop_id,
  variety_id:planVariety.variety_id,lot_code:"PLAN-STOCK-01",quantity_available:0,unit:"kg",status:"active"});
context.erpPostLedger("ProduceLotMovements",{produce_lot_id:planStockLot.produce_lot_id,
  movement_type:"receipt",quantity:15,unit:"kg",occurred_at:"2026-11-16T08:00:00.000Z",
  reference_type:"test_opening_stock",reference_id:"PLAN-STOCK-01"},"plan-produce-receipt");
const planCustomer=save("Customers",{customer_name:"Planning buyer",phone:"9000000099",status:"active"});
const planOrder=save("SalesOrders",{farm_id:farm1.farm_id,customer_id:planCustomer.customer_id,
  order_date:"2026-11-16",required_date:"2026-12-05",order_number:"SO-PLAN-01",
  currency_code:"INR",status:"confirmed"});
save("SalesOrderLines",{sales_order_id:planOrder.sales_order_id,product_id:planProduct.product_id,
  produce_lot_id:planStockLot.produce_lot_id,quantity_ordered:5,quantity_fulfilled:0,unit:"kg",grade:""});
save("DemandRecords",{farm_id:farm1.farm_id,crop_id:planCrop.crop_id,variety_id:planVariety.variety_id,
  demand_type:"confirmed",quantity:245,unit:"kg",required_date:"2026-12-06",status:"active"});
save("DemandRecords",{farm_id:farm1.farm_id,crop_id:planCrop.crop_id,variety_id:planVariety.variety_id,
  demand_type:"confirmed",quantity:5,unit:"kg",required_date:"2026-12-06",
  source_reference:planOrder.sales_order_id,status:"active"});
save("DemandRecords",{farm_id:farm1.farm_id,crop_id:planCrop.crop_id,variety_id:planVariety.variety_id,
  demand_type:"forecast",quantity:50,unit:"kg",period_start:"2026-12-01",period_end:"2026-12-31",status:"active"});
const approvedSupplyCycle=save("CropCycles",{farm_id:farm1.farm_id,field_id:loc1.field.field_id,
  plot_id:loc1.plot.plot_id,crop_id:planCrop.crop_id,variety_id:planVariety.variety_id,
  cycle_name:"Approved existing production",production_system:"open_field",start_date:"2026-10-01",
  expected_end_date:"2026-12-01",area_value:2,area_unit:"acre",plant_count:5000,status:"active"});
const draftSupplyCycle=save("CropCycles",{farm_id:farm1.farm_id,field_id:loc1.field.field_id,
  plot_id:loc1.plot.plot_id,crop_id:planCrop.crop_id,variety_id:planVariety.variety_id,
  cycle_name:"Unapproved proposal",production_system:"open_field",start_date:"2026-10-01",
  expected_end_date:"2026-12-01",area_value:10,area_unit:"acre",plant_count:25000,status:"draft"});
const planHarvest=save("HarvestSessions",{farm_id:farm1.farm_id,field_id:loc1.field.field_id,
  plot_id:loc1.plot.plot_id,crop_cycle_id:approvedSupplyCycle.crop_cycle_id,
  harvest_date:"2026-11-10",status:"finalised"});
context.erpFinalizeHarvest(planHarvest.harvest_id,[{crop_id:planCrop.crop_id,
  variety_id:planVariety.variety_id,quantity:40,unit:"kg",grade:"",disposition:"own_use"}],"plan-harvest-once");
const planResult=context.erpCalculateProductionGap(farm1.farm_id,"2026-12-01","2026-12-31");
const planRow=planResult.rows.find(x=>x.crop_id===planCrop.crop_id&&x.variety_id===planVariety.variety_id);
assert(!!planRow,"Demand planner should return the crop/variety demand bucket.");
assert(Number(planRow.confirmed_demand)===250,"Confirmed sales orders plus manual demand should be counted once.");
assert(Number(planRow.forecast_demand)===50,"Forecast demand should remain separate from confirmed demand.");
assert(Number(planRow.available_stock)===10,"Allocated stock must be deducted from saleable produce stock.");
assert(Number(planRow.projected_crop_supply)===160,"Only established crop cycles count as supply and harvest-to-date is deducted.");
assert(!planRow.supply_basis.some(x=>x.indexOf("Unapproved proposal")>=0),"Draft crop cycles must never count as committed supply.");
assert(Number(planRow.additional_production_required)===130,"New production must cover the net gap after current stock and crop supply.");
assert(Math.abs(Number(planRow.gross_production_required)-144.4444444444)<0.001,"Gross production must include the configured 10% loss allowance.");
assert(Math.abs(Number(planRow.required_cultivation_area)-1.4444444444)<0.001,"Area must use the configured per-acre yield basis.");
assert(Number(planRow.required_plant_count)>0&&Number(planRow.required_seed_quantity)>0,"Direct-seeded crop planning should size plants and seed using spacing, germination and survival.");
assert(Math.abs(Number(planRow.required_compost_quantity)-2.8888888889)<0.001,"Compost readiness quantity should use the configured per-area rate.");
assert(planRow.latest_safe_planting_date&&planRow.seed_procurement_by&&planRow.compost_ready_by,"Backward readiness dates should be calculated from the harvest target.");
assert(planRow.confidence==="high","Farm-history crop assumptions should be identified as high-confidence supply.");
const forecastVersion=context.erpCreateForecastVersion(farm1.farm_id,"2026-12-01","2026-12-31","forecast-version-once");
const forecastVersionReplay=context.erpCreateForecastVersion(farm1.farm_id,"2026-12-01","2026-12-31","forecast-version-once");
assert(forecastVersionReplay.duplicate===true,"Forecast-version requests should be safely replayable.");
assert(rows("ForecastVersions").filter(x=>x.farm_id===farm1.farm_id&&x.period_start==="2026-12-01").length===1,
  "Repeated forecast-version saves must not create duplicate snapshots.");
const savedCoverage=JSON.parse(forecastVersion.forecastVersion.coverage_json);
assert(savedCoverage.result_snapshot.rows.some(x=>x.crop_id===planCrop.crop_id&&x.additional_production_required===130),
  "Forecast versions should retain the full calculated result snapshot.");

// Daily Work Planner consolidates tasks, unlinked scouting actions, order demand and attendance.
const planTask=save("Tasks",{farm_id:farm1.farm_id,field_id:loc1.field.field_id,plot_id:loc1.plot.plot_id,
  crop_cycle_id:approvedSupplyCycle.crop_cycle_id,title:"Scheduled crop maintenance",task_type:"crop_operation",
  priority:"normal",status:"planned",planned_start:"2026-12-05",due_at:"2026-12-05",
  estimated_duration_minutes:60});
const planObservation=save("Observations",{farm_id:farm1.farm_id,field_id:loc1.field.field_id,
  plot_id:loc1.plot.plot_id,crop_cycle_id:approvedSupplyCycle.crop_cycle_id,
  observed_at:"2026-12-05T08:00:00.000Z",category:"pest_presence",severity:"high",
  quick_status:"action_required",description:"Fresh scouting observation"});
save("Attendance",{farm_id:farm1.farm_id,person_id:worker1.person_id,work_date:"2026-12-05",
  attendance_status:"present",total_minutes:480});
save("Attendance",{farm_id:farm1.farm_id,person_id:worker2.person_id,work_date:"2026-12-05",
  attendance_status:"absent",total_minutes:0});
const secondPlanOrder=save("SalesOrders",{farm_id:farm1.farm_id,customer_id:planCustomer.customer_id,
  order_date:"2026-11-16",required_date:"2026-12-05",order_number:"SO-PLAN-02",
  currency_code:"INR",status:"confirmed"});
const secondPlanLine=save("SalesOrderLines",{sales_order_id:secondPlanOrder.sales_order_id,
  product_id:planProduct.product_id,quantity_ordered:12,quantity_fulfilled:0,unit:"kg",grade:""});
const dayPlan=context.erpGetDailyWorkPlanner(farm1.farm_id,"2026-12-05");
assert(dayPlan.sources.scheduled_tasks.some(x=>x.task_id===planTask.task_id),"Daily planner should include scheduled crop tasks.");
assert(dayPlan.sources.scouting_actions.some(x=>x.observation_id===planObservation.observation_id),"Daily planner should surface unlinked scouting actions.");
const plannerOrder=dayPlan.sources.order_harvest_requirements.find(x=>x.source_line_id===secondPlanLine.sales_line_id);
assert(!!plannerOrder,"Daily planner should include open confirmed order lines for the selected day.");
assert(Number(plannerOrder.unallocated_stock_applied)===10&&Number(plannerOrder.estimated_harvest_gap)===2,
  "Daily planner should allocate shared unreserved saleable stock only once across order requirements.");
assert(dayPlan.workforce.available_count===1&&dayPlan.workforce.unavailable_count===1,
  "Daily planner should reflect recorded attendance without assuming unrecorded workers are present.");
const harvestTask=context.erpCreateTaskFromSalesOrderLine(secondPlanLine.sales_line_id,2,"planner-order-task-once");
const harvestTaskReplay=context.erpCreateTaskFromSalesOrderLine(secondPlanLine.sales_line_id,2,"planner-order-task-once");
assert(harvestTask.task.sales_order_id===secondPlanOrder.sales_order_id&&harvestTask.task.sales_line_id===secondPlanLine.sales_line_id,
  "Order-driven harvest tasks must retain the source order and line IDs.");
assert(harvestTask.task.status==="planned"&&!harvestTask.duplicate&&harvestTaskReplay.duplicate,
  "Order-driven harvest task creation should be unassigned, planned and idempotent.");

// Calendar overrides and tasks created from events must be repeat-safe.
// Calendar overrides and tasks created from events must be repeat-safe.
const event=save("CalendarEvents",{farm_id:farm1.farm_id,title:"Irrigation inspection",event_type:"irrigation",
  start_at:"2026-11-15T08:00:00.000Z",recurrence_type:"daily",recurrence_interval:1,recurrence_end:"2026-11-17",
  occurrence_limit:3,status:"active"});
const initialCalendar=context.erpGetCalendarRange(farm1.farm_id,"2026-11-15","2026-11-18").events;
assert(initialCalendar.length===3,"Daily recurring event should generate three expected occurrences.");
context.erpCancelCalendarOccurrence(event.event_id,initialCalendar[0].occurrence_start,"Cancelled","calendar-cancel-once");
context.erpCancelCalendarOccurrence(event.event_id,initialCalendar[0].occurrence_start,"Cancelled","calendar-cancel-once");
assert(context.erpGetCalendarRange(farm1.farm_id,"2026-11-15","2026-11-18").events.length===2,"Occurrence cancellation replay must not duplicate an override.");
context.erpUpdateCalendarEvent(event.event_id,"single",initialCalendar[1].occurrence_start,{title:"Updated irrigation inspection"},"Single edit","calendar-edit-once");
context.erpUpdateCalendarEvent(event.event_id,"single",initialCalendar[1].occurrence_start,{title:"Updated irrigation inspection"},"Single edit","calendar-edit-once");
const updatedCalendar=context.erpGetCalendarRange(farm1.farm_id,"2026-11-15","2026-11-18").events;
assert(updatedCalendar.some(x=>x.title==="Updated irrigation inspection"),"Single-occurrence override must be visible in calendar results.");
context.erpCreateTaskFromCalendarEvent(event.event_id,initialCalendar[1].occurrence_start,"Calendar follow-up","2026-11-16","calendar-task-once");
context.erpCreateTaskFromCalendarEvent(event.event_id,initialCalendar[1].occurrence_start,"Calendar follow-up","2026-11-16","calendar-task-once");
assert(rows("Tasks").filter(x=>x.title==="Calendar follow-up").length===1,"Calendar-created task replay must not duplicate tasks.");

// Integrity reporting is read-only and reports a clean transactional chain.
const integrity=context.erpGetWorkflowIntegrityReport(farm1.farm_id);
assert(integrity.issueCount===0,"The valid completed test transactions should pass workflow reconciliation.");
const report=context.erpReport("integrity",{farmId:farm1.farm_id});
assert(report.summary.passed===true,"The integrity report UI endpoint should return a passed summary.");

console.log("WORKFLOW INVARIANT TESTS PASSED");
console.log("Verified schema install, stock issue, aggregated procurement and fulfilment, invoice/payment, workforce, calendar, replay protection and ledger reconciliation.");
