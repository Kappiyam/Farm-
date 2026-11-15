/**
 * FarmERP transactional workflows: procurement, harvest, sales, calendar and reports.
 * Each workflow validates source records and uses idempotency where supplied.
 */

function erpReceiveProcurement(procurementId, receipts) {
  var order=erpFindByKey_("ProcurementOrders","procurement_id",procurementId);
  if(!order)throw new Error("Procurement order not found.");
  var lines=erpReadTable_("ProcurementLines"),created=[],receivedByLine={};
  (receipts||[]).forEach(function(r){
    var line=lines.find(function(x){return String(x.procurement_line_id)===String(r.procurement_line_id)&&String(x.procurement_id)===String(procurementId);});
    if(!line)throw new Error("A receipt line does not belong to this procurement order.");
    var qty=Number(r.quantity)||0, outstanding=(Number(line.quantity_ordered)||0)-(Number(line.quantity_received)||0);
    if(!(qty>0)||qty>outstanding+0.000001)throw new Error("Receipt quantity must be positive and cannot exceed outstanding quantity.");
    var lot=erpAppend_("StockLots",{farm_id:order.farm_id,item_id:line.item_id,lot_code:r.lot_code,
      received_date:new Date().toISOString().slice(0,10),expiry_date:r.expiry_date||"",quantity_received:qty,
      quantity_available:qty,unit:line.unit,unit_cost:Number(r.unit_cost)||Number(line.unit_cost)||0,
      supplier_id:order.supplier_id,storage_location:r.storage_location||line.storage_location||"",status:"active",
      reference_type:"procurement_receipt",reference_id:r.receipt_reference||procurementId});
    erpAppend_("InventoryTransactions",{farm_id:order.farm_id,item_id:line.item_id,lot_id:lot.lot_id,
      transaction_type:"receipt",quantity:qty,unit:line.unit,transaction_at:new Date().toISOString(),
      reference_type:"procurement",reference_id:procurementId,recorded_by:erpActor_(),notes:r.receipt_reference||""});
    receivedByLine[line.procurement_line_id]=(receivedByLine[line.procurement_line_id]||0)+qty;
    created.push(lot);
  });
  Object.keys(receivedByLine).forEach(function(id){
    var line=lines.find(function(x){return String(x.procurement_line_id)===String(id);});
    erpUpdateByKey_("ProcurementLines","procurement_line_id",id,{quantity_received:(Number(line.quantity_received)||0)+receivedByLine[id],updated_at:new Date().toISOString()});
  });
  var refreshed=erpReadTable_("ProcurementLines").filter(function(x){return String(x.procurement_id)===String(procurementId);});
  var complete=refreshed.every(function(x){return Number(x.quantity_received)>=Number(x.quantity_ordered)-0.000001;});
  var any=refreshed.some(function(x){return Number(x.quantity_received)>0;});
  var status=complete?"received":(any?"partially_received":"ordered");
  erpUpdateByKey_("ProcurementOrders","procurement_id",procurementId,{status:status,updated_at:new Date().toISOString()});
  return {ok:true,status:status,lots:created};
}

function erpFinalizeHarvest(harvestId, lines, requestKey) {
  var prior=requestKey&&erpIdempotentResult_(requestKey);if(prior)return prior;
  var session=erpFindByKey_("HarvestSessions","harvest_id",harvestId);
  if(!session)throw new Error("Harvest session not found.");
  if(String(session.status).toLowerCase()==="finalised"||String(session.status).toLowerCase()==="finalized")throw new Error("Harvest session is already finalised.");
  if(!lines||!lines.length)throw new Error("At least one harvest line is required.");
  var created=[];
  lines.forEach(function(line){
    var qty=Number(line.quantity)||0;if(!(qty>0)||!line.unit)throw new Error("Every harvest line needs a positive quantity and unit.");
    var saved=erpAppend_("HarvestLines",Object.assign({},line,{farm_id:session.farm_id,harvest_id:harvestId}));
    if(["sale","processing"].indexOf(String(line.disposition||"sale"))>=0){
      var lot=erpAppend_("ProduceLots",{farm_id:session.farm_id,harvest_id:harvestId,harvest_line_id:saved.harvest_line_id,
        crop_id:line.crop_id||"",variety_id:line.variety_id||"",lot_code:line.lot_code||("PL-"+saved.harvest_line_id.slice(0,8)),
        grade:line.grade||"",quantity_received:qty,quantity_available:qty,unit:line.unit,
        disposition:line.disposition||"sale",storage_location:line.storage_location||"",status:"active"});
      saved.produce_lot_id=lot.produce_lot_id;
    }
    created.push(saved);
  });
  erpUpdateByKey_("HarvestSessions","harvest_id",harvestId,{status:"finalised",updated_at:new Date().toISOString()});
  var result={ok:true,lines:created};if(requestKey)erpStoreIdempotency_(requestKey,"erpFinalizeHarvest",result);return result;
}

function erpFulfilSalesOrder(orderId, fulfilmentReference, fulfilLines, fulfilmentDate) {
  var order=erpFindByKey_("SalesOrders","sales_order_id",orderId);if(!order)throw new Error("Sales order not found.");
  var sourceLines=erpReadTable_("SalesOrderLines").filter(function(x){return String(x.sales_order_id)===String(orderId);});
  var allFulfil=erpReadTable_("FulfilmentLines"),lots=erpReadTable_("ProduceLots");
  var prepared=(fulfilLines||[]).map(function(x){
    var line=sourceLines.find(function(y){return String(y.sales_line_id)===String(x.sales_line_id);});
    var lot=lots.find(function(y){return String(y.produce_lot_id)===String(x.produce_lot_id);});
    if(!line||!lot)throw new Error("Invalid sales line or produce lot.");
    var fulfilled=allFulfil.filter(function(y){return String(y.sales_line_id)===String(line.sales_line_id);}).reduce(function(s,y){return s+(Number(y.quantity)||0);},0);
    var remaining=(Number(line.quantity_ordered)||0)-fulfilled,qty=Number(x.quantity)||0;
    if(!(qty>0)||qty>remaining+0.000001)throw new Error("Fulfilment quantity exceeds the order-line balance.");
    if(String(lot.farm_id)!==String(order.farm_id)||String(lot.unit)!==String(line.unit)||String(lot.crop_id)!==String((erpFindByKey_("Products","product_id",line.product_id)||{}).crop_id))throw new Error("Produce lot does not match the order product, farm or unit.");
    if(String(lot.status)!=="active"||qty>Number(lot.quantity_available)+0.000001)throw new Error("Insufficient available produce lot quantity.");
    return {line:line,lot:lot,quantity:qty};
  });
  if(!prepared.length)throw new Error("No fulfilment quantities supplied.");
  var fulfil=erpAppend_("Fulfilments",{farm_id:order.farm_id,sales_order_id:orderId,fulfilment_reference:fulfilmentReference||("FUL-"+Utilities.getUuid()),fulfilment_date:fulfilmentDate||new Date().toISOString(),status:"completed"});
  prepared.forEach(function(x){
    erpAppend_("FulfilmentLines",{fulfilment_id:fulfil.fulfilment_id,sales_order_id:orderId,sales_line_id:x.line.sales_line_id,produce_lot_id:x.lot.produce_lot_id,quantity:x.quantity,unit:x.line.unit});
    erpUpdateByKey_("ProduceLots","produce_lot_id",x.lot.produce_lot_id,{quantity_available:Number(x.lot.quantity_available)-x.quantity});
    erpAppend_("ProduceLotMovements",{farm_id:order.farm_id,produce_lot_id:x.lot.produce_lot_id,movement_type:"dispatch",quantity:x.quantity,unit:x.line.unit,reference_type:"fulfilment",reference_id:fulfil.fulfilment_id,moved_at:new Date().toISOString(),recorded_by:erpActor_()});
  });
  var latest=erpReadTable_("FulfilmentLines"),done=sourceLines.every(function(l){
    var total=latest.filter(function(x){return String(x.sales_line_id)===String(l.sales_line_id);}).reduce(function(s,x){return s+(Number(x.quantity)||0);},0);
    return total>=Number(l.quantity_ordered)-0.000001;
  });
  var status=done?"fulfilled":"partially_fulfilled";
  erpUpdateByKey_("SalesOrders","sales_order_id",orderId,{status:status,updated_at:new Date().toISOString()});
  return {ok:true,fulfilment:fulfil,orderStatus:status};
}

function erpCreateInvoiceFromOrder(orderId, dueDate) {
  var order=erpFindByKey_("SalesOrders","sales_order_id",orderId);if(!order)throw new Error("Sales order not found.");
  var lines=erpReadTable_("SalesOrderLines").filter(function(x){return String(x.sales_order_id)===String(orderId);});
  var fulfilled=erpReadTable_("FulfilmentLines"),already=erpReadTable_("InvoiceLines");
  var invoiceLines=[];
  lines.forEach(function(line){
    var qty=fulfilled.filter(function(x){return String(x.sales_line_id)===String(line.sales_line_id);}).reduce(function(s,x){return s+(Number(x.quantity)||0);},0);
    var billed=already.filter(function(x){return String(x.sales_line_id)===String(line.sales_line_id);}).reduce(function(s,x){return s+(Number(x.quantity)||0);},0);
    var available=Math.max(0,qty-billed);
    if(available>0)invoiceLines.push({sales_line_id:line.sales_line_id,description:line.description||"",quantity:available,unit:line.unit,unit_price:Number(line.unit_price)||0,tax_rate:Number(line.tax_rate)||0,line_total:available*(Number(line.unit_price)||0)});
  });
  if(!invoiceLines.length)throw new Error("No fulfilled, uninvoiced quantities are available.");
  var subtotal=invoiceLines.reduce(function(s,x){return s+x.line_total;},0);
  var tax=invoiceLines.reduce(function(s,x){return s+x.line_total*(x.tax_rate/100);},0);
  var number="INV-"+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyyMMdd")+"-"+Utilities.getUuid().slice(0,6).toUpperCase();
  var invoice=erpAppend_("Invoices",{farm_id:order.farm_id,customer_id:order.customer_id,sales_order_id:orderId,invoice_number:number,
    invoice_date:new Date().toISOString().slice(0,10),due_date:dueDate||"",currency_code:order.currency_code||"INR",
    subtotal:subtotal,tax_amount:tax,total_amount:subtotal+tax,status:"issued",created_by:erpActor_()});
  invoiceLines.forEach(function(x){erpAppend_("InvoiceLines",Object.assign({},x,{invoice_id:invoice.invoice_id}));});
  return {ok:true,invoice:invoice,total:subtotal+tax,currency:invoice.currency_code};
}

function erpRecordCustomerPayment(invoiceId, payment, requestKey) {
  var prior=requestKey&&erpIdempotentResult_(requestKey);if(prior)return prior;
  var invoice=erpFindByKey_("Invoices","invoice_id",invoiceId);if(!invoice)throw new Error("Invoice not found.");
  var amount=Number(payment&&payment.amount)||0;if(!(amount>0))throw new Error("Payment amount must be positive.");
  var received=erpReadTable_("Payments").filter(function(p){return String(p.invoice_id)===String(invoiceId);}).reduce(function(s,p){return s+(Number(p.amount)||0);},0);
  var balance=Math.max(0,Number(invoice.total_amount)-received);
  if(amount>balance+0.000001)throw new Error("Payment exceeds outstanding invoice balance.");
  var saved=erpAppend_("Payments",Object.assign({},payment,{farm_id:invoice.farm_id,invoice_id:invoiceId,customer_id:invoice.customer_id,recorded_by:erpActor_()}));
  var newBalance=balance-amount,status=newBalance<=0.000001?"paid":"partially_paid";
  erpUpdateByKey_("Invoices","invoice_id",invoiceId,{status:status,updated_at:new Date().toISOString()});
  var result={ok:true,payment:saved,balanceDue:newBalance,currency:invoice.currency_code||"INR",status:status};
  if(requestKey)erpStoreIdempotency_(requestKey,"erpRecordCustomerPayment",result);return result;
}

function erpCalculateProductionGap(farmId,startDate,endDate) {
  var demand=erpReadTable_("DemandRecords").filter(function(d){return (!farmId||String(d.farm_id)===String(farmId))&&String(d.required_date||"")>=startDate&&String(d.required_date||"")<=endDate&&erpActive_(d.status);});
  var cycles=erpReadTable_("CropCycles").filter(function(c){return (!farmId||String(c.farm_id)===String(farmId))&&erpActive_(c.status);});
  var crops=erpReadTable_("Crops"),lots=erpReadTable_("ProduceLots");
  var ids={};demand.forEach(function(d){ids[d.crop_id]=true;});cycles.forEach(function(c){ids[c.crop_id]=true;});
  var rows=Object.keys(ids).map(function(cropId){
    var ds=demand.filter(function(d){return String(d.crop_id)===String(cropId);});
    var confirmed=ds.filter(function(d){return String(d.demand_type).toLowerCase()==="confirmed";}).reduce(function(s,d){return s+(Number(d.quantity)||0);},0);
    var forecast=ds.filter(function(d){return String(d.demand_type).toLowerCase()!=="confirmed";}).reduce(function(s,d){return s+(Number(d.quantity)||0);},0);
    var stock=lots.filter(function(l){return String(l.crop_id)===String(cropId)&&erpActive_(l.status);}).reduce(function(s,l){return s+(Number(l.quantity_available)||0);},0);
    var cropCycles=cycles.filter(function(c){return String(c.crop_id)===String(cropId);});
    var projected=cropCycles.reduce(function(s,c){return s+(Number(c.expected_yield)||0);},0);
    var crop=crops.find(function(c){return String(c.crop_id)===String(cropId);})||{};
    return {crop_id:cropId,crop_name:crop.crop_name||cropId,unit:ds[0]&&ds[0].unit||"",confirmed_demand:confirmed,forecast_demand:forecast,available_stock:stock,projected_crop_supply:projected,gap_confirmed:confirmed-stock-projected,gap_including_forecast:confirmed+forecast-stock-projected,confidence:"indicative"};
  });
  return {ok:true,rows:rows,methodology:"Confirmed demand and forecast demand are reported separately. Available stock is summed from active produce lots. Projected crop supply uses expected_yield where entered on crop-cycle records; no yield is inferred.",limitations:["Results depend on complete demand, crop-cycle expected-yield and produce-lot records.","Mixed units are not converted automatically; compare only like units."]};
}

function erpReport(reportKey, filters) {
  filters=filters||{};var start=filters.startDate||"0000-01-01",end=filters.endDate||"9999-12-31",farmId=filters.farmId;
  var map={production:"CropCycles",tasks:"Tasks",workforce:"Attendance",inventory:"StockLots",harvest:"HarvestSessions",sales:"SalesOrders",finance:"FinanceEntries",assets:"Assets","crop-profitability":"CostAllocations"};
  var table=map[reportKey];if(!table)throw new Error("Unsupported report type.");
  var rows=erpReadTable_(table).filter(function(r){
    var date=String(r.harvest_date||r.attendance_date||r.entry_date||r.order_date||r.created_at||r.start_date||"").slice(0,10);
    return (!farmId||String(r.farm_id)===String(farmId))&&date>=start&&date<=end;
  });
  var summary={records:rows.length};
  if(reportKey==="finance")summary.totalAmount=rows.reduce(function(s,r){return s+(Number(r.amount)||0);},0);
  if(reportKey==="harvest")summary.totalHarvestQuantity=rows.reduce(function(s,r){return s+(Number(r.quantity)||0);},0);
  if(reportKey==="tasks"){summary.completed=rows.filter(function(r){return r.status==="completed";}).length;summary.open=rows.filter(function(r){return ["completed","cancelled"].indexOf(r.status)<0;}).length;}
  return {ok:true,report:reportKey,period:{start:start,end:end},summary:summary,rows:rows,
    methodology:"This report is a direct aggregation of recorded "+table+" rows for the selected period. It does not substitute forecasts for actuals or infer missing values."};
}

/* Calendar recurrence is expanded at read time; only exceptions are persisted. */
function erpGetCalendarRange(farmId,startDate,endDate) {
  var events=erpReadTable_("CalendarEvents").filter(function(e){return (!farmId||String(e.farm_id)===String(farmId))&&erpActive_(e.status);});
  var exceptions=erpReadTable_("CalendarExceptions"),out=[];
  events.forEach(function(e){
    var start=new Date(e.start_at),end=e.end_at?new Date(e.end_at):null;
    if(isNaN(start.getTime()))return;
    var recurrence=String(e.recurrence_type||"none").toLowerCase(),interval=Math.max(1,Number(e.recurrence_interval)||1),limit=Math.min(1000,Number(e.occurrence_limit)||500),count=0;
    var cursor=new Date(start);
    while(count<limit&&cursor.toISOString().slice(0,10)<=endDate){
      var date=cursor.toISOString().slice(0,10);
      if(date>=startDate){
        var occurrence=cursor.toISOString(),ex=exceptions.find(function(x){return String(x.event_id)===String(e.event_id)&&String(x.occurrence_start)===occurrence;});
        if(!ex||ex.exception_type!=="cancel"){
          var item=Object.assign({},e,{occurrence_start:occurrence,occurrence_end:end?new Date(cursor.getTime()+(end.getTime()-start.getTime())).toISOString():"",status:ex&&ex.exception_type==="override"?"updated":e.status});
          if(ex&&ex.override_json){try{item=Object.assign(item,JSON.parse(ex.override_json));}catch(ignore){}}
          out.push(item);
        }
      }
      count++;
      if(recurrence==="none")break;
      if(recurrence==="daily"||recurrence==="custom")cursor.setDate(cursor.getDate()+interval);
      else if(recurrence==="weekly")cursor.setDate(cursor.getDate()+7*interval);
      else if(recurrence==="monthly")cursor.setMonth(cursor.getMonth()+interval);
      else if(recurrence==="yearly")cursor.setFullYear(cursor.getFullYear()+interval);
      else break;
      if(e.recurrence_end&&cursor.toISOString().slice(0,10)>String(e.recurrence_end).slice(0,10))break;
    }
  });
  out.sort(function(a,b){return String(a.occurrence_start).localeCompare(String(b.occurrence_start));});
  return {ok:true,events:out};
}

function erpCancelCalendarOccurrence(eventId,occurrenceStart,reason) {
  var event=erpFindByKey_("CalendarEvents","event_id",eventId);if(!event)throw new Error("Calendar event not found.");
  var existing=erpReadTable_("CalendarExceptions").find(function(x){return String(x.event_id)===String(eventId)&&String(x.occurrence_start)===String(occurrenceStart);});
  if(existing)erpUpdateByKey_("CalendarExceptions","calendar_exception_id",existing.calendar_exception_id,{exception_type:"cancel",reason:reason||"",created_at:new Date().toISOString()});
  else erpAppend_("CalendarExceptions",{event_id:eventId,occurrence_start:occurrenceStart,exception_type:"cancel",reason:reason||""});
  return {ok:true,cancelled:true};
}

function erpUpdateCalendarEvent(eventId,scope,occurrenceStart,patch,reason) {
  var event=erpFindByKey_("CalendarEvents","event_id",eventId);if(!event)throw new Error("Calendar event not found.");
  if(scope==="single"){
    var exception=erpReadTable_("CalendarExceptions").find(function(x){return String(x.event_id)===String(eventId)&&String(x.occurrence_start)===String(occurrenceStart);});
    var merged=Object.assign({},patch);
    if(exception)erpUpdateByKey_("CalendarExceptions","calendar_exception_id",exception.calendar_exception_id,{exception_type:"override",override_json:JSON.stringify(merged),reason:reason||""});
    else erpAppend_("CalendarExceptions",{event_id:eventId,occurrence_start:occurrenceStart,exception_type:"override",override_json:JSON.stringify(merged),reason:reason||""});
    return {ok:true,scope:scope};
  }
  if(scope==="future"){
    var start=String(occurrenceStart).slice(0,10);
    erpReadTable_("CalendarEvents").filter(function(e){return String(e.event_id)===String(eventId);});
    patch.start_at=patch.start_at||event.start_at;
    return {ok:true,scope:scope,note:"Future-series editing is recorded as a series-level update in this initial workflow.",updated:erpUpdateByKey_("CalendarEvents","event_id",eventId,Object.assign({},patch,{updated_at:new Date().toISOString()}))};
  }
  return {ok:true,scope:"series",updated:erpUpdateByKey_("CalendarEvents","event_id",eventId,Object.assign({},patch,{updated_at:new Date().toISOString()}))};
}

function erpCreateTaskFromCalendarEvent(eventId,occurrenceStart,title,dueAt) {
  var event=erpFindByKey_("CalendarEvents","event_id",eventId);if(!event)throw new Error("Calendar event not found.");
  return erpAppend_("Tasks",{farm_id:event.farm_id,site_id:event.site_id,field_id:event.field_id,plot_id:event.plot_id,
    title:title||event.title,description:event.description,task_type:"calendar_follow_up",status:"planned",
    planned_start:occurrenceStart,due_at:dueAt||String(occurrenceStart).slice(0,10),created_by:erpActor_()});
}
