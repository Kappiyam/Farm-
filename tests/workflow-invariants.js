const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
let uuid = 0;

class FakeRange {
  constructor(sheet, row, col, rows, cols) { Object.assign(this,{sheet,row,col,rows,cols}); }
  getValues() {
    const out=[];
    for(let r=0;r<this.rows;r++){
      const line=[];
      for(let c=0;c<this.cols;c++) line.push((this.sheet.data[this.row-1+r]||[])[this.col-1+c] ?? "");
      out.push(line);
    }
    return out;
  }
  getDisplayValues() { return this.getValues().map(row=>row.map(v=>v instanceof Date?v.toISOString():String(v??""))); }
  setValues(values) {
    values.forEach((line,r)=>line.forEach((value,c)=>{
      const rr=this.row-1+r,cc=this.col-1+c;
      while(this.sheet.data.length<=rr)this.sheet.data.push([]);
      this.sheet.data[rr][cc]=value;
    }));
    return this;
  }
  setValue(value) { return this.setValues([[value]]); }
}
class FakeSheet {
  constructor(name,headers){this.name=name;this.data=[headers.slice()];this.frozen=0;}
  getLastColumn(){return this.data[0].length;}
  getLastRow(){return this.data.length;}
  getDataRange(){return new FakeRange(this,1,1,this.getLastRow(),this.getLastColumn());}
  getRange(r,c,nr=1,nc=1){return new FakeRange(this,r,c,nr,nc);}
  appendRow(row){this.data.push(row.slice());}
  setFrozenRows(n){this.frozen=n;}
  getFrozenRows(){return this.frozen;}
}
class FakeSpreadsheet {
  constructor(){this.sheets={};}
  getName(){return "FarmERP test database";}
  getSheetByName(name){return this.sheets[name]||null;}
  insertSheet(name){const s=new FakeSheet(name,[]);this.sheets[name]=s;return s;}
}
const ss=new FakeSpreadsheet();
const context={
  console,
  Date,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  isFinite,
  SpreadsheetApp:{getActiveSpreadsheet:()=>ss},
  LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
  Session:{getActiveUser:()=>({getEmail:()=>"test-owner"}),getScriptTimeZone:()=>"Asia/Kolkata"},
  Utilities:{
    getUuid:()=>("test-uuid-"+(++uuid)),
    formatDate:(date,tz,format)=>format==="yyyyMMdd"?date.toISOString().slice(0,10).replace(/-/g,""):date.toISOString().slice(0,10)
  }
};
vm.createContext(context);
for(const file of ["Code.gs","ErpSchema.gs","ErpApi.gs","ErpWorkflows.gs"]){
  vm.runInContext(fs.readFileSync(path.join(root,"backend",file),"utf8"),context,{filename:file});
}
for(const [name,definition] of Object.entries(vm.runInContext('ERP_TABLE_DEFINITIONS',context))){
  const sheet=new FakeSheet(name,definition.split("|"));
  ss.sheets[name]=sheet;
}
function seed(table,row){
  const headers=vm.runInContext('ERP_TABLE_DEFINITIONS',context)[table].split("|");
  ss.getSheetByName(table).appendRow(headers.map(h=>row[h]===undefined?"":row[h]));
}
function rows(table){return context.erpReadTable_(table);}
function assert(ok,message){if(!ok)throw new Error(message);}
function throws(fn,message){let did=false;try{fn();}catch(e){did=true;}assert(did,message);}

// Workflow-managed ledgers must not be writable through the generic ledger endpoint.
throws(()=>context.erpPostLedger("Payments",{farm_id:"F-1",amount:1}),"Payments must use the invoice payment workflow.");
throws(()=>context.erpPostLedger("InventoryTransactions",{farm_id:"F-1",quantity:1}),"Inventory transactions must use a stock workflow.");
throws(()=>context.erpPostLedger("TaskExecution",{farm_id:"F-1",quantity:1}),"Task execution must use the task execution workflow.");

// Safe direct ledger entries remain validated and append-only.
throws(()=>context.erpPostLedger("FinanceEntries",{farm_id:"F-1",entry_date:"2026-11-15",entry_type:"expense",amount:-10}),"Negative finance amounts must be rejected.");
assert(rows("FinanceEntries").length===0,"Rejected finance ledger entries must not be written.");
context.erpPostLedger("FinanceEntries",{farm_id:"F-1",entry_date:"2026-11-15",entry_type:"expense",amount:10,category:"test"});
assert(rows("FinanceEntries").length===1,"Valid finance ledger entries should be appendable.");

// Generic saves must not silently discard fields or create records with caller-supplied unknown keys.
throws(()=>context.erpSave("Sites",{farm_id:"F-1",site_name:"Test site",unexpected_field:"bad"}),"Unknown save fields must be rejected.");
throws(()=>context.erpSave("Sites",{site_id:"NONEXISTENT",farm_id:"F-1",site_name:"Test site"}),"Unknown supplied primary keys must not create records.");

// Simulate an interrupted multi-sheet workflow: a failed request key must block blind replay.
const journalBefore=rows("ActivityJournal").length;
throws(()=>context.erpRunLockedWorkflow_("testPartialWrite","partial-write-key",function(){
  context.erpAppend_("ActivityJournal",{farm_id:"F-1",activity_date:"2026-11-15",activity_type:"test",title:"Partial write"});
  throw new Error("injected failure after first write");
}),"Injected workflow failure should surface.");
assert(rows("ActivityJournal").length===journalBefore+1,"Failure injection should leave the first write visible for reconciliation.");
throws(()=>context.erpRunLockedWorkflow_("testPartialWrite","partial-write-key",function(){
  context.erpAppend_("ActivityJournal",{farm_id:"F-1",activity_date:"2026-11-15",activity_type:"test",title:"Duplicate retry"});
}),"A failed request key must block blind retry.");
assert(rows("ActivityJournal").length===journalBefore+1,"A failed request retry must not append duplicate data.");

// Procurement: repeated input lines must be summed before any write.
seed("ProcurementOrders",{procurement_id:"PO-1",farm_id:"F-1",supplier_id:"S-1",status:"ordered"});
seed("ProcurementLines",{procurement_line_id:"POL-1",procurement_id:"PO-1",farm_id:"F-1",item_id:"I-1",quantity_ordered:10,quantity_received:0,unit:"kg",unit_cost:5});
throws(()=>context.erpReceiveProcurement("PO-1",[
  {procurement_line_id:"POL-1",quantity:6,lot_code:"A"},
  {procurement_line_id:"POL-1",quantity:5,lot_code:"B"}
],"po-over"));
assert(rows("StockLots").length===0,"Rejected procurement batch must not create stock lots.");
const receipts=[{procurement_line_id:"POL-1",quantity:4,lot_code:"A"},{procurement_line_id:"POL-1",quantity:6,lot_code:"B"}];
context.erpReceiveProcurement("PO-1",receipts,"po-once");
context.erpReceiveProcurement("PO-1",receipts,"po-once");
assert(rows("StockLots").length===2,"Procurement request replay must not duplicate lots.");
assert(Number(rows("ProcurementLines")[0].quantity_received)===10,"Repeated receipt rows must cumulatively update received quantity.");

// Fulfilment: repeated references to one lot must be aggregated before availability validation.
seed("SalesOrders",{sales_order_id:"SO-1",farm_id:"F-1",customer_id:"C-1",status:"confirmed",currency_code:"INR"});
seed("Products",{product_id:"P-1",product_name:"Test produce",crop_id:"CR-1"});
seed("SalesOrderLines",{sales_line_id:"SOL-1",sales_order_id:"SO-1",product_id:"P-1",quantity_ordered:10,unit:"kg",unit_price:10,tax_rate:0});
seed("ProduceLots",{produce_lot_id:"PL-1",farm_id:"F-1",crop_id:"CR-1",unit:"kg",quantity_received:10,quantity_available:10,status:"active"});
throws(()=>context.erpFulfilSalesOrder("SO-1","FUL-OVER",[
  {sales_line_id:"SOL-1",produce_lot_id:"PL-1",quantity:6},
  {sales_line_id:"SOL-1",produce_lot_id:"PL-1",quantity:5}
],"2026-11-15","ful-over"));
assert(rows("Fulfilments").length===0,"Rejected fulfilment batch must not create a fulfilment.");
const fulfilLines=[{sales_line_id:"SOL-1",produce_lot_id:"PL-1",quantity:4},{sales_line_id:"SOL-1",produce_lot_id:"PL-1",quantity:6}];
context.erpFulfilSalesOrder("SO-1","FUL-ONCE",fulfilLines,"2026-11-15","ful-once");
context.erpFulfilSalesOrder("SO-1","FUL-ONCE",fulfilLines,"2026-11-15","ful-once");
assert(rows("FulfilmentLines").length===2,"Fulfilment request replay must not duplicate fulfilment lines.");
assert(Number(rows("ProduceLots")[0].quantity_available)===0,"Fulfilment must deduct aggregated lot quantity once.");

// Invoice and payment: request replay must not create duplicate financial records.
const invoiceResult=context.erpCreateInvoiceFromOrder("SO-1","2026-12-15","inv-once");
context.erpCreateInvoiceFromOrder("SO-1","2026-12-15","inv-once");
assert(rows("Invoices").length===1&&rows("InvoiceLines").length===1,"Invoice replay must not duplicate invoice records.");
const invoice=invoiceResult.invoice;
throws(()=>context.erpRecordCustomerPayment(invoice.invoice_id,{amount:10,payment_date:"15-11-2026",payment_method:"cash"},"pay-bad-date"),"Invalid payment dates must be rejected.");
throws(()=>context.erpRecordCustomerPayment(invoice.invoice_id,{amount:10,payment_date:"2026-11-15",payment_method:"crypto"},"pay-bad-method"),"Unsupported payment methods must be rejected.");
seed("PaymentAccounts",{account_id:"ACC-OTHER",farm_id:"F-2",account_name:"Other farm account",status:"active"});
throws(()=>context.erpRecordCustomerPayment(invoice.invoice_id,{amount:10,payment_date:"2026-11-15",payment_method:"cash",account_id:"ACC-OTHER"},"pay-wrong-farm"),"Payment accounts from another farm must be rejected.");
assert(rows("Payments").length===0,"Rejected payment attempts must not create payment rows.");
context.erpRecordCustomerPayment(invoice.invoice_id,{amount:10,payment_date:"2026-11-15",payment_method:"cash"},"pay-bad-date");
assert(rows("Payments").length===1,"A validation-only rejection should allow the same request key to be retried after correction.");
context.erpRecordCustomerPayment(invoice.invoice_id,{amount:90,payment_date:"2026-11-15",payment_method:"cash"},"pay-once");
context.erpRecordCustomerPayment(invoice.invoice_id,{amount:90,payment_date:"2026-11-15",payment_method:"cash"},"pay-once");
assert(rows("Payments").length===2,"Payment replay must not duplicate payment records.");
// Harvest finalisation creates traceable produce lots and replays safely.
seed("HarvestSessions",{harvest_id:"H-1",farm_id:"F-1",harvest_date:"2026-11-15",status:"open"});
const harvestLines=[{crop_id:"CR-1",quantity:5,unit:"kg",disposition:"sale",lot_code:"HARV-1"}];
context.erpFinalizeHarvest("H-1",harvestLines,"harvest-once");
context.erpFinalizeHarvest("H-1",harvestLines,"harvest-once");
assert(rows("HarvestLines").filter(x=>String(x.harvest_id)==="H-1").length===1,"Harvest replay must not duplicate harvest lines.");
assert(rows("ProduceLots").filter(x=>String(x.harvest_id)==="H-1").length===1,"Harvest finalisation must create one linked produce lot.");

// Calendar recurrence, single-occurrence cancellation and override must be deterministic.
seed("CalendarEvents",{event_id:"EVT-1",farm_id:"F-1",title:"Irrigation check",event_type:"irrigation",start_at:"2026-11-15T08:00:00.000Z",recurrence_type:"daily",recurrence_interval:1,recurrence_end:"2026-11-17",occurrence_limit:3,status:"active"});
const calendarInitial=context.erpGetCalendarRange("F-1","2026-11-15","2026-11-18").events;
assert(calendarInitial.length===3,"Daily calendar recurrence should produce the expected three occurrences.");
context.erpCancelCalendarOccurrence("EVT-1",calendarInitial[0].occurrence_start,"Cancelled","calendar-cancel-once");
context.erpCancelCalendarOccurrence("EVT-1",calendarInitial[0].occurrence_start,"Cancelled","calendar-cancel-once");
assert(context.erpGetCalendarRange("F-1","2026-11-15","2026-11-18").events.length===2,"Calendar cancellation replay must not create duplicate occurrences.");
context.erpUpdateCalendarEvent("EVT-1","single",calendarInitial[1].occurrence_start,{title:"Updated irrigation check"},"Single occurrence override","calendar-override-once");
const calendarAfter=context.erpGetCalendarRange("F-1","2026-11-15","2026-11-18").events;
assert(calendarAfter.some(x=>x.occurrence_start===calendarInitial[1].occurrence_start&&x.title==="Updated irrigation check"),"Single-occurrence calendar override should be reflected in the range.");

const cleanIntegrity=context.erpGetWorkflowIntegrityReport("F-1");
assert(cleanIntegrity.issueCount===0,"Valid completed workflow records should pass the integrity report.");
seed("FulfilmentLines",{fulfilment_id:"FUL-ORPHAN",sales_order_id:"SO-1",sales_line_id:"SOL-1",produce_lot_id:"PL-1",quantity:1,unit:"kg"});
const partialIntegrity=context.erpGetWorkflowIntegrityReport("F-1");
assert(partialIntegrity.issues.some(x=>x.entity_type==="Fulfilment"&&x.entity_id==="FUL-ORPHAN"),"Integrity report must detect fulfilment lines without matching dispatch movements.");
throws(()=>context.erpRunLockedWorkflow_("differentAction","pay-once",function(){return {ok:true};}),"A request key must not be reusable for a different workflow action.");

// State transitions must reject impossible jumps.
seed("Tasks",{task_id:"T-1",farm_id:"F-1",status:"planned",title:"Test task"});
throws(()=>context.erpUpdateTaskStatus("T-1","completed","invalid jump"),"Planned task must not jump directly to completed.");
context.erpUpdateTaskStatus("T-1","assigned","valid transition");
assert(rows("Tasks")[0].status==="assigned","Valid task transition should persist.");
const historyCount=rows("TaskStatusHistory").length;
context.erpUpdateTaskStatus("T-1","assigned","duplicate retry");
assert(rows("TaskStatusHistory").length===historyCount,"Repeated identical task status must not append duplicate history.");

// Assignment and execution records must also replay without duplication.
seed("People",{person_id:"P-1",display_name:"Test worker",status:"active"});
seed("People",{person_id:"P-2",display_name:"Unassigned worker",status:"active"});
seed("Teams",{team_id:"TEAM-1",farm_id:"F-1",team_name:"Field crew",status:"active"});
seed("TeamMembers",{team_member_id:"TM-1",farm_id:"F-1",team_id:"TEAM-1",person_id:"P-1",status:"active"});
throws(()=>context.erpAssignTask("T-1",[{person_id:"P-2"}],"assign-nonmember"),"Workers outside the task farm must not be assigned.");
context.erpAssignTask("T-1",[{person_id:"P-1"},{team_name:"Field crew"}],"assign-once");
context.erpAssignTask("T-1",[{person_id:"P-1"},{team_name:"Field crew"}],"assign-once");
assert(rows("TaskAssignments").filter(x=>String(x.task_id)==="T-1").length===2,"Assignment replay must not duplicate person/team assignments.");
const execution=[{person_id:"P-1",quantity:2,quantity_unit:"hours",duration_minutes:120,notes:"Test execution"}];
context.erpRecordTaskExecution("T-1",execution,"execution-once");
context.erpRecordTaskExecution("T-1",execution,"execution-once");
assert(rows("TaskExecution").filter(x=>String(x.task_id)==="T-1").length===1,"Execution replay must not duplicate task actuals.");


// Crop task generation must remain duplicate-safe when the same cycle is generated twice.
seed("CropCycles",{crop_cycle_id:"CC-1",farm_id:"F-1",crop_id:"CR-1",planting_date:"2026-11-01",status:"active"});
seed("TaskTemplates",{template_id:"TT-1",farm_id:"F-1",crop_id:"CR-1",template_name:"First field check",task_type:"scouting",offset_days:7,default_priority:"normal",status:"active"});
context.erpGenerateCropTasks("CC-1");
context.erpGenerateCropTasks("CC-1");
assert(rows("Tasks").filter(t=>String(t.crop_cycle_id)==="CC-1").length===1,"Repeated crop task generation must not duplicate template tasks.");

// Schema migration must remain additive and preserve existing row data.
const siteHeaders=vm.runInContext('ERP_TABLE_DEFINITIONS',context).Sites.split("|");
const oldSites=new FakeSheet("Sites",siteHeaders.slice(0,-1));
oldSites.appendRow(siteHeaders.slice(0,-1).map(h=>h==="site_id"?"SITE-OLD":h==="site_name"?"Existing site":""));
ss.sheets.Sites=oldSites;
delete ss.sheets.Attachments;
const migrationPreview=context.erpPreviewSchemaMigration();
assert(migrationPreview.createTabs.some(x=>x.table==="Attachments"),"Migration preview must identify a missing canonical tab.");
assert(migrationPreview.appendColumns.some(x=>x.table==="Sites"),"Migration preview must identify missing trailing columns.");
context.erpInstallSchema();
assert(ss.getSheetByName("Attachments")!==null,"Additive migration must create a missing canonical tab.");
assert(ss.getSheetByName("Sites").getDataRange().getValues()[1][0]==="SITE-OLD","Additive migration must preserve existing site records.");
const afterMigration=context.erpPreviewSchemaMigration();
assert(afterMigration.createTabs.length===0&&afterMigration.appendColumns.length===0,"Second migration preview should be clean after additive installation.");
const brokenSites=new FakeSheet("Sites",["legacy_site_key"].concat(siteHeaders.slice(1)));
brokenSites.appendRow(["OLD-KEY"]);
ss.sheets.Sites=brokenSites;
const mismatchPreview=context.erpPreviewSchemaMigration();
assert(!mismatchPreview.ok&&mismatchPreview.mismatches.some(x=>x.table==="Sites"),"Migration preview must detect primary-key conflicts.");
throws(()=>context.erpInstallSchema(),"Schema migration must refuse a primary-key mismatch.");


console.log("WORKFLOW INVARIANT TESTS PASSED");
console.log("Checked cumulative procurement, same-lot fulfilment, idempotent replay, invoice/payment replay and task transitions.");
