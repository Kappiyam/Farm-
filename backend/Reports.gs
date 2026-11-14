/**
 * FarmERP management information, reporting and backup services.
 * Figures are derived from posted source records; estimate/actual distinctions are retained.
 */
function erpReportDates_(filters){
  filters=filters||{};
  return {start:erpDateKey_(filters.startDate||"1900-01-01"),end:erpDateKey_(filters.endDate||"2999-12-31")};
}
function erpFilterFarm_(rows,farmId){
  return farmId?rows.filter(r=>String(r.farm_id||"")===String(farmId)):rows;
}
function erpReport(name,filters){
  filters=filters||{};
  const range=erpReportDates_(filters),farmId=filters.farmId||"";
  const inRange=v=>!v|| (erpDateKey_(v)>=range.start&&erpDateKey_(v)<=range.end);
  const read=(table)=>erpFilterFarm_(erpRead_(table,{limit:1000}).rows,farmId);
  let rows=[],summary={},methodology="";
  if(name==="production"){
    const crops={};read("CropCycles").filter(c=>inRange(c.start_date)).forEach(c=>{
      const crop=erpGetCached_("Crops",c.crop_id),key=c.crop_id||"unknown";
      if(!crops[key])crops[key]={crop:crop?crop.crop_name:key,cycles:0,area:0,plant_count:0,active:0};
      crops[key].cycles++;crops[key].area+=Number(c.area_value)||0;crops[key].plant_count+=Number(c.plant_count)||0;
      if(!["completed","terminated","cancelled"].includes(String(c.status||"").toLowerCase()))crops[key].active++;
    });
    rows=Object.keys(crops).map(k=>Object.assign({crop_id:k},crops[k]));
    summary={cropCount:rows.length,cycleCount:rows.reduce((s,r)=>s+r.cycles,0),activeCycles:rows.reduce((s,r)=>s+r.active,0)};
    methodology="Crop-cycle records and configured areas/plant counts. These are production records, not forecast yield.";
  }else if(name==="tasks"){
    const tasks=read("Tasks").filter(t=>inRange(t.created_at||t.planned_start));
    const execution=read("TaskExecution");
    rows=tasks.map(t=>{
      const actual=execution.filter(x=>String(x.task_id)===String(t.task_id));
      return {task_id:t.task_id,title:t.title,status:t.status,priority:t.priority,due_at:t.due_at,
        execution_records:actual.length,actual_minutes:actual.reduce((s,x)=>s+(Number(x.duration_minutes)||0),0),
        actual_quantity:actual.reduce((s,x)=>s+(Number(x.quantity)||0),0)};
    });
    summary={tasks:rows.length,completed:rows.filter(r=>String(r.status).toLowerCase()==="completed").length,
      blocked:rows.filter(r=>String(r.status).toLowerCase()==="blocked").length,
      actualMinutes:rows.reduce((s,r)=>s+r.actual_minutes,0)};
    methodology="Task status and separate task-execution records. Completion status is not treated as measured output.";
  }else if(name==="workforce"){
    const people=read("People"),attendance=read("Attendance").filter(a=>inRange(a.work_date)),execution=read("TaskExecution").filter(x=>inRange(x.started_at));
    rows=people.map(p=>{
      const a=attendance.filter(x=>x.person_id===p.person_id),e=execution.filter(x=>x.person_id===p.person_id);
      return {person_id:p.person_id,person:p.display_name,attendance_days:a.length,
        attendance_minutes:a.reduce((s,x)=>s+(Number(x.total_minutes)||0),0),
        task_participations:e.length,task_minutes:e.reduce((s,x)=>s+(Number(x.duration_minutes)||0),0),
        measured_quantity:e.reduce((s,x)=>s+(Number(x.quantity)||0),0)};
    }).filter(r=>r.attendance_days||r.task_participations);
    summary={people:rows.length,attendanceDays:rows.reduce((s,r)=>s+r.attendance_days,0),
      attendanceMinutes:rows.reduce((s,r)=>s+r.attendance_minutes,0),taskMinutes:rows.reduce((s,r)=>s+r.task_minutes,0)};
    methodology="Attendance and productive task participation are reported separately. Team output is not divided equally between workers.";
  }else if(name==="inventory"){
    const items=erpRead_("InventoryItems",{limit:1000}).rows,tx=read("InventoryTransactions");
    rows=items.map(item=>{
      const moves=tx.filter(t=>String(t.item_id)===String(item.item_id));
      const balance=moves.reduce((s,t)=>s+erpSignedStock_(t.transaction_type,Number(t.quantity)||0),0);
      const receipts=moves.filter(t=>["receipt","return_in","production_in","adjustment_in"].includes(String(t.transaction_type).toLowerCase()));
      const receiptQty=receipts.reduce((s,t)=>s+(Number(t.quantity)||0),0);
      const receiptValue=receipts.reduce((s,t)=>s+(Number(t.quantity)||0)*(Number(t.unit_cost)||0),0);
      const averageCost=receiptQty?receiptValue/receiptQty:0;
      return {item_id:item.item_id,item:item.item_name,category:item.item_category,unit:item.base_unit,
        on_hand:balance,reorder_level:Number(item.reorder_level)||0,average_receipt_cost:averageCost,
        indicative_stock_value:balance*averageCost,below_reorder:Number(item.reorder_level)>0&&balance<=Number(item.reorder_level)};
    });
    summary={items:rows.length,belowReorder:rows.filter(r=>r.below_reorder).length,
      indicativeStockValue:rows.reduce((s,r)=>s+r.indicative_stock_value,0)};
    methodology="Stock on hand is calculated from the inventory movement ledger. Indicative value uses weighted average receipt cost where receipt costs are recorded; it is not a statutory inventory valuation.";
  }else if(name==="harvest"){
    const sessions=read("HarvestSessions").filter(h=>inRange(h.harvest_date)),byId={};sessions.forEach(h=>byId[h.harvest_id]=h);
    const lines=erpRead_("HarvestLines",{limit:1000}).rows.filter(l=>byId[l.harvest_id]);
    rows=lines.map(l=>{
      const h=byId[l.harvest_id],p=erpGetCached_("Plots",h.plot_id),c=erpGetCached_("Crops",l.crop_id);
      return {harvest_id:h.harvest_id,harvest_date:h.harvest_date,plot:p?p.plot_name:h.plot_id,
        crop:c?c.crop_name:l.crop_id,grade:l.grade,quantity:l.quantity,unit:l.unit,disposition:l.disposition,produce_lot_id:l.produce_lot_id};
    });
    summary={sessions:sessions.length,lines:rows.length,quantity:rows.reduce((s,r)=>s+(Number(r.quantity)||0),0)};
    methodology="Harvest lines are joined to their harvest sessions. Traceability follows the saved harvest and produce-lot IDs.";
  }else if(name==="sales"){
    const orders=read("SalesOrders").filter(o=>inRange(o.order_date));
    const invoices=read("Invoices").filter(i=>inRange(i.invoice_date));
    const payments=read("Payments").filter(p=>inRange(p.payment_date));
    rows=orders.map(o=>({order_id:o.sales_order_id,order_number:o.order_number,customer:(erpGetCached_("Customers",o.customer_id)||{}).customer_name,
      order_date:o.order_date,status:o.status,total:Number(o.total_amount)||0,currency:o.currency_code}));
    summary={orders:orders.length,orderValue:orders.reduce((s,o)=>s+(Number(o.total_amount)||0),0),
      invoices:invoices.length,invoiced:invoices.reduce((s,i)=>s+(Number(i.total_amount)||0),0),
      payments:payments.length,received:payments.reduce((s,p)=>s+(Number(p.amount)||0),0)};
    methodology="Orders, invoices and payment transactions are shown as separate business states. Payment receipt is not inferred from invoice or order status.";
  }else if(name==="finance"){
    const entries=read("FinanceEntries").filter(e=>inRange(e.entry_date));
    const allocations=read("CostAllocations");
    const allocatedByEntry={};allocations.forEach(a=>allocatedByEntry[a.finance_entry_id]=(allocatedByEntry[a.finance_entry_id]||0)+(Number(a.allocated_amount)||0));
    rows=entries.map(e=>({finance_entry_id:e.finance_entry_id,date:e.entry_date,type:e.entry_type,category:e.category,
      description:e.description,amount:Number(e.amount)||0,cost_class:e.cost_class||"unallocated",
      allocated:allocatedByEntry[e.finance_entry_id]||0,
      unallocated:Math.max(0,(Number(e.amount)||0)-(allocatedByEntry[e.finance_entry_id]||0)),
      status:e.status,currency:e.currency_code}));
    const income=rows.filter(r=>String(r.type).toLowerCase()==="income").reduce((s,r)=>s+r.amount,0);
    const expense=rows.filter(r=>String(r.type).toLowerCase()==="expense").reduce((s,r)=>s+r.amount,0);
    summary={entries:rows.length,income:income,expenses:expense,netCashMovement:income-expense,
      allocated:rows.reduce((s,r)=>s+r.allocated,0),unallocated:rows.reduce((s,r)=>s+r.unallocated,0)};
    methodology="Source finance entries are retained. Cost allocations are separately calculated and reconciled by source entry; they are not additional cash expenses.";
  }else if(name==="assets"){
    const assets=erpRead_("Assets",{limit:1000}).rows,maintenance=erpRead_("Maintenance",{limit:1000}).rows.filter(m=>inRange(m.completed_date||m.scheduled_date));
    rows=assets.map(a=>{const m=maintenance.filter(x=>x.asset_id===a.asset_id);return {asset_id:a.asset_id,asset:a.asset_name,category:a.asset_category,status:a.current_status,
      maintenance_records:m.length,maintenance_cost:m.reduce((s,x)=>s+(Number(x.cost)||0),0),
      downtime_hours:m.reduce((s,x)=>s+(Number(x.downtime_hours)||0),0)};});
    summary={assets:rows.length,maintenanceCost:rows.reduce((s,r)=>s+r.maintenance_cost,0),downtimeHours:rows.reduce((s,r)=>s+r.downtime_hours,0)};
    methodology="Asset register joined to maintenance and repair records. Asset usage should be recorded separately for utilisation analysis.";
  }else if(name==="crop-profitability"){
    const cycles=read("CropCycles"),alloc=read("CostAllocations"),entries=read("FinanceEntries"),harvests=read("HarvestSessions"),lots=read("ProduceLots");
    rows=cycles.map(c=>{
      const crop=erpGetCached_("Crops",c.crop_id),costs=alloc.filter(a=>a.crop_cycle_id===c.crop_cycle_id);
      const cost=costs.reduce((s,a)=>s+(Number(a.allocated_amount)||0),0);
      const direct=entries.filter(e=>e.reference_type==="CropCycle"&&e.reference_id===c.crop_cycle_id&&String(e.cost_class).toLowerCase()==="direct_actual").reduce((s,e)=>s+(Number(e.amount)||0),0);
      const produced=harvests.filter(h=>h.crop_cycle_id===c.crop_cycle_id);
      const producedIds=new Set(produced.map(h=>h.harvest_id));
      const quantity=erpRead_("HarvestLines",{limit:1000}).rows.filter(l=>producedIds.has(l.harvest_id)).reduce((s,l)=>s+(Number(l.quantity)||0),0);
      const sales=lots.filter(l=>l.source_cycle_id===c.crop_cycle_id);
      const revenue=0;
      return {crop_cycle_id:c.crop_cycle_id,cycle:c.cycle_name,crop:crop?crop.crop_name:c.crop_id,
        area:c.area_value,area_unit:c.area_unit,harvested_quantity:quantity,direct_cost:direct,
        allocated_cost:cost,total_known_cost:direct+cost,realised_revenue:revenue,
        margin_status:"Revenue linkage required"};
    });
    summary={cycles:rows.length,knownCost:rows.reduce((s,r)=>s+r.total_known_cost,0)};
    methodology="Costs are reported from direct source entries and documented allocations. Realised revenue is not inferred from harvested quantity; a verified lot-to-invoice linkage is required before margin is calculated.";
  }else{
    throw new Error("Unknown report: "+name);
  }
  return {ok:true,report:name,period:range,farmId:farmId,summary:summary,rows:rows,methodology:methodology};
}
function erpGetCached_(table,id){
  if(!id)return null;
  const k=ERP_KEYS[table];if(!k)return null;
  const cache=CacheService.getScriptCache(),key="ERP:"+table+":"+id;
  const value=cache.get(key);if(value)return JSON.parse(value);
  const found=erpRead_(table,{limit:1000,filter:{[k]:String(id)}}).rows[0]||null;
  if(found)cache.put(key,JSON.stringify(found),300);
  return found;
}

/** Create an independent Drive copy of the bound database. Run only on explicit request. */
function erpBackupDatabase(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error("Database spreadsheet is unavailable.");
  const stamp=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyyMMdd-HHmmss");
  const file=DriveApp.getFileById(ss.getId()).makeCopy("FarmERP-Backup-"+stamp);
  return {ok:true,fileId:file.getId(),name:file.getName(),url:file.getUrl(),createdAt:new Date().toISOString(),
    note:"Backup copy created in the executing user's Google Drive. Restore procedure must be tested separately."};
}

/** Export the standard table dictionary and stable key definitions for migration. */
function erpGetDataDictionary(){
  return {version:ERP_SCHEMA_VERSION,tables:ERP_TABLES,primaryKeys:ERP_KEYS,requiredFields:ERP_REQUIRED,
    transactionTables:["InventoryTransactions","FinanceEntries","Payments","WageTransactions","TaskExecution","HarvestLines","Attendance","IrrigationOperations"],
    policy:{postedTransactions:"reverse or adjust; do not delete",planningVsActual:"separate records",
      inventory:"append-only movement ledger",farmSpecificConfiguration:"stored as data, not code"}};
}
