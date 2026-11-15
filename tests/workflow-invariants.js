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
seed("ProduceLots",{produce_lot_id:"PL-1",farm_id:"F-1",crop_id:"CR-1",unit:"kg",quantity_available:10,status:"active"});
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
context.erpRecordCustomerPayment(invoice.invoice_id,{amount:100,payment_date:"2026-11-15",payment_method:"cash"},"pay-once");
context.erpRecordCustomerPayment(invoice.invoice_id,{amount:100,payment_date:"2026-11-15",payment_method:"cash"},"pay-once");
assert(rows("Payments").length===1,"Payment replay must not duplicate payment records.");

// State transitions must reject impossible jumps.
seed("Tasks",{task_id:"T-1",farm_id:"F-1",status:"planned",title:"Test task"});
throws(()=>context.erpUpdateTaskStatus("T-1","completed","invalid jump"),"Planned task must not jump directly to completed.");
context.erpUpdateTaskStatus("T-1","assigned","valid transition");
assert(rows("Tasks")[0].status==="assigned","Valid task transition should persist.");


// Crop task generation must remain duplicate-safe when the same cycle is generated twice.
seed("CropCycles",{crop_cycle_id:"CC-1",farm_id:"F-1",crop_id:"CR-1",planting_date:"2026-11-01",status:"active"});
seed("TaskTemplates",{template_id:"TT-1",farm_id:"F-1",crop_id:"CR-1",template_name:"First field check",task_type:"scouting",offset_days:7,default_priority:"normal",status:"active"});
context.erpGenerateCropTasks("CC-1");
context.erpGenerateCropTasks("CC-1");
assert(rows("Tasks").filter(t=>String(t.crop_cycle_id)==="CC-1").length===1,"Repeated crop task generation must not duplicate template tasks.");

console.log("WORKFLOW INVARIANT TESTS PASSED");
console.log("Checked cumulative procurement, same-lot fulfilment, idempotent replay, invoice/payment replay and task transitions.");
