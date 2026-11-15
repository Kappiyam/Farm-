/**
 * FarmERP transactional workflows: procurement, harvest, sales, calendar and reports.
 * Each workflow validates source records and uses idempotency where supplied.
 */


function erpIssueInventoryLotUnlocked_(lotId,quantity,plotId,notes,reference) {
  var lot=erpFindByKey_("StockLots","lot_id",lotId);
  if(!lot||!erpActive_(lot.status))throw new Error("Active stock lot not found.");
  var item=erpFindByKey_("InventoryItems","item_id",lot.item_id);
  if(!item||String(item.farm_id)!==String(lot.farm_id)||!erpActive_(item.status))throw new Error("Stock item is not active for this farm.");
  var qty=Number(quantity);
  if(!isFinite(qty)||qty<=0)throw new Error("Issue quantity must be positive.");
  var available=Number(lot.quantity_available)||0;
  if(qty>available+0.000001)throw new Error("Issue quantity exceeds available stock.");
  if(plotId){
    var plot=erpFindByKey_("Plots","plot_id",plotId);
    if(!plot||String(plot.farm_id)!==String(lot.farm_id)||!erpActive_(plot.status))throw new Error("Destination plot is not active for this farm.");
  }
  var remaining=available-qty;
  erpUpdateByKey_("StockLots","lot_id",lotId,{quantity_available:remaining,status:remaining<=0.000001?"depleted":"active"});
  var transaction=erpAppend_("InventoryTransactions",{farm_id:lot.farm_id,item_id:lot.item_id,lot_id:lotId,
    transaction_type:"issue",quantity:qty,unit:lot.unit,transaction_at:new Date().toISOString(),
    location_id:plotId||"",reference_type:"farm_use",reference_id:reference||plotId||lotId,
    recorded_by:erpActor_(),notes:notes||""});
  return {ok:true,transaction:transaction,remaining:remaining,unit:lot.unit};
}

function erpIssueInventoryLot(lotId,quantity,plotId,notes,reference,requestKey) {
  return erpRunLockedWorkflow_("erpIssueInventoryLot",requestKey,function(){
    return erpIssueInventoryLotUnlocked_(lotId,quantity,plotId,notes,reference);
  });
}

function erpReceiveProcurement(procurementId, receipts, requestKey) {
  return erpRunLockedWorkflow_("erpReceiveProcurement",requestKey,function(){
    var order=erpFindByKey_("ProcurementOrders","procurement_id",procurementId);
    if(!order)throw new Error("Procurement order not found.");
    var supplier=order.supplier_id&&erpFindByKey_("Suppliers","supplier_id",order.supplier_id);
    if(order.supplier_id&&(!supplier||String(supplier.farm_id)!==String(order.farm_id)||!erpActive_(supplier.status)))throw new Error("Procurement supplier is not active for this farm.");
    var lines=erpReadTable_("ProcurementLines").filter(function(x){return String(x.procurement_id)===String(procurementId);});
    var requested={},prepared=[];
    (receipts||[]).forEach(function(r){
      var line=lines.find(function(x){return String(x.procurement_line_id)===String(r.procurement_line_id);});
      if(!line||String(line.farm_id)!==String(order.farm_id))throw new Error("A receipt line does not belong to this procurement order and farm.");
      var item=erpFindByKey_("InventoryItems","item_id",line.item_id);
      if(!item||String(item.farm_id)!==String(order.farm_id)||!erpActive_(item.status))throw new Error("Receipt item is not active for this farm.");
      var qty=Number(r.quantity);
      if(!isFinite(qty)||qty<=0)throw new Error("Receipt quantity must be positive.");
      requested[line.procurement_line_id]=(requested[line.procurement_line_id]||0)+qty;
      prepared.push({receipt:r,line:line,quantity:qty});
    });
    if(!prepared.length)throw new Error("At least one receipt line is required.");
    Object.keys(requested).forEach(function(id){
      var line=lines.find(function(x){return String(x.procurement_line_id)===String(id);});
      var outstanding=(Number(line.quantity_ordered)||0)-(Number(line.quantity_received)||0);
      if(requested[id]>outstanding+0.000001)throw new Error("Receipt quantity exceeds outstanding quantity for line "+id+".");
    });
    var created=[],receivedByLine={};
    prepared.forEach(function(x){
      var r=x.receipt,line=x.line,qty=x.quantity;
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
  });
}

function erpFinalizeHarvest(harvestId, lines, requestKey) {
  return erpRunLockedWorkflow_("erpFinalizeHarvest",requestKey,function(){
    var session=erpFindByKey_("HarvestSessions","harvest_id",harvestId);
    if(!session)throw new Error("Harvest session not found.");
    if(["finalised","finalized"].indexOf(String(session.status).toLowerCase())>=0)throw new Error("Harvest session is already finalised.");
    if(!lines||!lines.length)throw new Error("At least one harvest line is required.");
    lines.forEach(function(line){var qty=Number(line.quantity);if(!isFinite(qty)||qty<=0||!line.unit)throw new Error("Every harvest line needs a positive quantity and unit.");});
    var created=[];
    lines.forEach(function(line){
      var qty=Number(line.quantity);
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
    return {ok:true,lines:created};
  });
}

function erpFulfilSalesOrder(orderId, fulfilmentReference, fulfilLines, fulfilmentDate, requestKey) {
  return erpRunLockedWorkflow_("erpFulfilSalesOrder",requestKey,function(){
    var order=erpFindByKey_("SalesOrders","sales_order_id",orderId);if(!order)throw new Error("Sales order not found.");
    if(["cancelled","closed"].indexOf(String(order.status||"").toLowerCase())>=0)throw new Error("This sales order cannot be fulfilled.");
    var sourceLines=erpReadTable_("SalesOrderLines").filter(function(x){return String(x.sales_order_id)===String(orderId);});
    var allFulfil=erpReadTable_("FulfilmentLines"),lots=erpReadTable_("ProduceLots");
    var prepared=[],byLine={},byLot={};
    (fulfilLines||[]).forEach(function(x){
      var line=sourceLines.find(function(y){return String(y.sales_line_id)===String(x.sales_line_id);});
      var lot=lots.find(function(y){return String(y.produce_lot_id)===String(x.produce_lot_id);});
      if(!line||!lot)throw new Error("Invalid sales line or produce lot.");
      var qty=Number(x.quantity);if(!isFinite(qty)||qty<=0)throw new Error("Fulfilment quantity must be positive.");
      var product=erpFindByKey_("Products","product_id",line.product_id)||{};
      if(String(lot.farm_id)!==String(order.farm_id)||String(lot.unit)!==String(line.unit)||String(lot.crop_id)!==String(product.crop_id))throw new Error("Produce lot does not match the order product, farm or unit.");
      if(String(lot.status)!=="active")throw new Error("Produce lot is not active.");
      byLine[line.sales_line_id]=(byLine[line.sales_line_id]||0)+qty;
      byLot[lot.produce_lot_id]=(byLot[lot.produce_lot_id]||0)+qty;
      prepared.push({line:line,lot:lot,quantity:qty});
    });
    if(!prepared.length)throw new Error("No fulfilment quantities supplied.");
    Object.keys(byLine).forEach(function(id){
      var line=sourceLines.find(function(y){return String(y.sales_line_id)===String(id);});
      var fulfilled=allFulfil.filter(function(y){return String(y.sales_line_id)===String(id);}).reduce(function(sum,y){return sum+(Number(y.quantity)||0);},0);
      if(byLine[id]>(Number(line.quantity_ordered)||0)-fulfilled+0.000001)throw new Error("Fulfilment quantity exceeds the order-line balance.");
    });
    Object.keys(byLot).forEach(function(id){
      var lot=lots.find(function(y){return String(y.produce_lot_id)===String(id);});
      if(byLot[id]>(Number(lot.quantity_available)||0)+0.000001)throw new Error("Fulfilment quantity exceeds available quantity in produce lot "+id+".");
    });
    var fulfil=erpAppend_("Fulfilments",{farm_id:order.farm_id,sales_order_id:orderId,fulfilment_reference:fulfilmentReference||("FUL-"+Utilities.getUuid()),fulfilment_date:fulfilmentDate||new Date().toISOString(),status:"completed"});
    prepared.forEach(function(x){
      erpAppend_("FulfilmentLines",{fulfilment_id:fulfil.fulfilment_id,sales_order_id:orderId,sales_line_id:x.line.sales_line_id,produce_lot_id:x.lot.produce_lot_id,quantity:x.quantity,unit:x.line.unit});
      erpAppend_("ProduceLotMovements",{farm_id:order.farm_id,produce_lot_id:x.lot.produce_lot_id,movement_type:"dispatch",quantity:x.quantity,unit:x.line.unit,reference_type:"fulfilment",reference_id:fulfil.fulfilment_id,moved_at:new Date().toISOString(),recorded_by:erpActor_()});
    });
    Object.keys(byLot).forEach(function(id){
      var lot=lots.find(function(y){return String(y.produce_lot_id)===String(id);});
      erpUpdateByKey_("ProduceLots","produce_lot_id",id,{quantity_available:Number(lot.quantity_available)-byLot[id]});
    });
    var latest=erpReadTable_("FulfilmentLines"),done=sourceLines.every(function(l){
      var total=latest.filter(function(x){return String(x.sales_line_id)===String(l.sales_line_id);}).reduce(function(sum,x){return sum+(Number(x.quantity)||0);},0);
      return total>=Number(l.quantity_ordered)-0.000001;
    });
    var status=done?"fulfilled":"partially_fulfilled";
    erpUpdateByKey_("SalesOrders","sales_order_id",orderId,{status:status,updated_at:new Date().toISOString()});
    return {ok:true,fulfilment:fulfil,orderStatus:status};
  });
}

function erpCreateInvoiceFromOrder(orderId, dueDate, requestKey) {
  return erpRunLockedWorkflow_("erpCreateInvoiceFromOrder",requestKey,function(){
    var order=erpFindByKey_("SalesOrders","sales_order_id",orderId);if(!order)throw new Error("Sales order not found.");
    var lines=erpReadTable_("SalesOrderLines").filter(function(x){return String(x.sales_order_id)===String(orderId);});
    var fulfilled=erpReadTable_("FulfilmentLines"),already=erpReadTable_("InvoiceLines");
    var invoiceLines=[];
    lines.forEach(function(line){
      var qty=fulfilled.filter(function(x){return String(x.sales_line_id)===String(line.sales_line_id);}).reduce(function(sum,x){return sum+(Number(x.quantity)||0);},0);
      var billed=already.filter(function(x){return String(x.sales_line_id)===String(line.sales_line_id);}).reduce(function(sum,x){return sum+(Number(x.quantity)||0);},0);
      var available=Math.max(0,qty-billed);
      if(available>0)invoiceLines.push({sales_line_id:line.sales_line_id,description:line.description||"",quantity:available,unit:line.unit,unit_price:Number(line.unit_price)||0,tax_rate:Number(line.tax_rate)||0,line_total:available*(Number(line.unit_price)||0)});
    });
    if(!invoiceLines.length)throw new Error("No fulfilled, uninvoiced quantities are available.");
    var subtotal=invoiceLines.reduce(function(sum,x){return sum+x.line_total;},0);
    var tax=invoiceLines.reduce(function(sum,x){return sum+x.line_total*(x.tax_rate/100);},0);
    var number="INV-"+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyyMMdd")+"-"+Utilities.getUuid().slice(0,6).toUpperCase();
    var invoice=erpAppend_("Invoices",{farm_id:order.farm_id,customer_id:order.customer_id,sales_order_id:orderId,invoice_number:number,
      invoice_date:new Date().toISOString().slice(0,10),due_date:dueDate||"",currency_code:order.currency_code||"INR",
      subtotal:subtotal,tax_amount:tax,total_amount:subtotal+tax,status:"issued",created_by:erpActor_()});
    invoiceLines.forEach(function(x){erpAppend_("InvoiceLines",Object.assign({},x,{invoice_id:invoice.invoice_id}));});
    return {ok:true,invoice:invoice,total:subtotal+tax,currency:invoice.currency_code};
  });
}

function erpRecordCustomerPayment(invoiceId, payment, requestKey) {
  return erpRunLockedWorkflow_("erpRecordCustomerPayment",requestKey,function(){
    var invoice=erpFindByKey_("Invoices","invoice_id",invoiceId);if(!invoice)throw new Error("Invoice not found.");
    if(["void","cancelled"].indexOf(String(invoice.status||"").toLowerCase())>=0)throw new Error("Payments cannot be recorded against a void or cancelled invoice.");
    payment=payment||{};
    var amount=Number(payment.amount);
    if(!isFinite(amount)||amount<=0)throw new Error("Payment amount must be positive.");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(payment.payment_date||"")))throw new Error("A valid payment date is required.");
    var methods=["upi","bank_transfer","cash","cheque","card","other"];
    if(methods.indexOf(String(payment.payment_method||"").toLowerCase())<0)throw new Error("Select a valid payment method.");
    if(payment.account_id){
      var account=erpFindByKey_("PaymentAccounts","account_id",payment.account_id);
      if(!account||String(account.farm_id)!==String(invoice.farm_id)||!erpActive_(account.status))throw new Error("The selected payment account is not active for this farm.");
    }
    var received=erpReadTable_("Payments").filter(function(p){return String(p.invoice_id)===String(invoiceId);}).reduce(function(sum,p){return sum+(Number(p.amount)||0);},0);
    var balance=Math.max(0,Number(invoice.total_amount)-received);
    if(amount>balance+0.000001)throw new Error("Payment exceeds outstanding invoice balance.");
    var saved=erpAppend_("Payments",Object.assign({},payment,{farm_id:invoice.farm_id,invoice_id:invoiceId,customer_id:invoice.customer_id,recorded_by:erpActor_()}));
    var newBalance=balance-amount,status=newBalance<=0.000001?"paid":"partially_paid";
    erpUpdateByKey_("Invoices","invoice_id",invoiceId,{status:status,updated_at:new Date().toISOString()});
    return {ok:true,payment:saved,balanceDue:newBalance,currency:invoice.currency_code||"INR",status:status};
  });
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


/**
 * Read-only cross-sheet integrity checks for recovering interrupted workflows.
 * This diagnoses inconsistencies; it does not modify or auto-correct records.
 */
function erpGetWorkflowIntegrityReport(farmId) {
  function inFarmIntegrity(row){return !farmId||String(row.farm_id)===String(farmId);}
  function issue(type,id,description,expected,actual){
    issues.push({entity_type:type,entity_id:id,issue:description,expected:expected,actual:actual});
  }
  var issues=[],checks=0,tolerance=0.000001;
  var procurementLines=erpReadTable_("ProcurementLines").filter(inFarmIntegrity);
  var inventory=erpReadTable_("InventoryTransactions").filter(inFarmIntegrity);
  var procurementGroups={};
  procurementLines.forEach(function(line){
    var key=String(line.procurement_id)+"|"+String(line.item_id);
    if(!procurementGroups[key])procurementGroups[key]={procurement_id:line.procurement_id,item_id:line.item_id,expected:0};
    procurementGroups[key].expected+=Number(line.quantity_received)||0;
  });
  Object.keys(procurementGroups).forEach(function(key){
    checks++;
    var g=procurementGroups[key],actual=inventory.filter(function(tx){
      return String(tx.reference_type)==="procurement"&&String(tx.reference_id)===String(g.procurement_id)&&String(tx.item_id)===String(g.item_id)&&String(tx.transaction_type)==="receipt";
    }).reduce(function(sum,tx){return sum+(Number(tx.quantity)||0);},0);
    if(Math.abs(actual-g.expected)>tolerance)issue("ProcurementOrder",g.procurement_id,"Received line quantities do not match posted inventory receipt transactions.",g.expected,actual);
  });

  erpReadTable_("StockLots").filter(inFarmIntegrity).forEach(function(lot){
    var lotTransactions=inventory.filter(function(tx){return String(tx.lot_id)===String(lot.lot_id);});
    if(lotTransactions.some(function(tx){return ["receipt","issue"].indexOf(String(tx.transaction_type))<0;}))return;
    checks++;
    var received=lotTransactions.filter(function(tx){return String(tx.transaction_type)==="receipt";}).reduce(function(sum,tx){return sum+(Number(tx.quantity)||0);},0);
    var issued=lotTransactions.filter(function(tx){return String(tx.transaction_type)==="issue";}).reduce(function(sum,tx){return sum+(Number(tx.quantity)||0);},0);
    var expected=received-issued,actual=Number(lot.quantity_available)||0;
    if(Math.abs(expected-actual)>tolerance)issue("StockLot",lot.lot_id,"Available stock does not match receipt transactions less farm-use issues.",expected,actual);
  });

  var harvestLines=erpReadTable_("HarvestLines").filter(inFarmIntegrity),produceLots=erpReadTable_("ProduceLots").filter(inFarmIntegrity);
  harvestLines.forEach(function(line){
    if(["sale","processing"].indexOf(String(line.disposition||"sale"))<0)return;
    checks++;
    var count=produceLots.filter(function(lot){return String(lot.harvest_line_id)===String(line.harvest_line_id);}).length;
    if(count!==1)issue("HarvestLine",line.harvest_line_id,"Sale/processing harvest line must have exactly one produce lot.",1,count);
  });

  var fulfilmentLines=erpReadTable_("FulfilmentLines"),movements=erpReadTable_("ProduceLotMovements").filter(inFarmIntegrity);
  var fulfilGroups={};
  fulfilmentLines.forEach(function(line){
    var lot=produceLots.find(function(l){return String(l.produce_lot_id)===String(line.produce_lot_id);});
    if(farmId&&(!lot||String(lot.farm_id)!==String(farmId)))return;
    var key=String(line.fulfilment_id)+"|"+String(line.produce_lot_id);
    fulfilGroups[key]=(fulfilGroups[key]||0)+(Number(line.quantity)||0);
  });
  Object.keys(fulfilGroups).forEach(function(key){
    checks++;
    var parts=key.split("|"),actual=movements.filter(function(m){
      return String(m.reference_type)==="fulfilment"&&String(m.reference_id)===parts[0]&&String(m.produce_lot_id)===parts[1]&&String(m.movement_type)==="dispatch";
    }).reduce(function(sum,m){return sum+(Number(m.quantity)||0);},0);
    if(Math.abs(actual-fulfilGroups[key])>tolerance)issue("Fulfilment",parts[0],"Fulfilment line quantity does not match its produce-lot dispatch movement.",fulfilGroups[key],actual);
  });

  produceLots.forEach(function(lot){
    checks++;
    var lotMoves=movements.filter(function(m){return String(m.produce_lot_id)===String(lot.produce_lot_id);});
    var unsupported=lotMoves.some(function(m){return String(m.movement_type)!=="dispatch";});
    if(unsupported)return;
    var dispatched=lotMoves.reduce(function(sum,m){return sum+(Number(m.quantity)||0);},0);
    var expected=(Number(lot.quantity_received)||0)-dispatched,actual=Number(lot.quantity_available)||0;
    if(Math.abs(expected-actual)>tolerance)issue("ProduceLot",lot.produce_lot_id,"Available lot quantity does not match received quantity less recorded dispatches.",expected,actual);
  });

  var invoices=erpReadTable_("Invoices").filter(inFarmIntegrity),invoiceLines=erpReadTable_("InvoiceLines"),payments=erpReadTable_("Payments");
  invoices.forEach(function(invoice){
    checks++;
    var lines=invoiceLines.filter(function(line){return String(line.invoice_id)===String(invoice.invoice_id);});
    var subtotal=lines.reduce(function(sum,line){return sum+(Number(line.line_total)||0);},0);
    var tax=lines.reduce(function(sum,line){return sum+(Number(line.line_total)||0)*(Number(line.tax_rate)||0)/100;},0);
    if(Math.abs(subtotal-(Number(invoice.subtotal)||0))>tolerance)issue("Invoice",invoice.invoice_id,"Invoice line subtotal does not match invoice header.",subtotal,Number(invoice.subtotal)||0);
    if(Math.abs(tax-(Number(invoice.tax_amount)||0))>tolerance)issue("Invoice",invoice.invoice_id,"Invoice line tax does not match invoice header.",tax,Number(invoice.tax_amount)||0);
    if(Math.abs(subtotal+tax-(Number(invoice.total_amount)||0))>tolerance)issue("Invoice",invoice.invoice_id,"Invoice total does not equal line subtotal plus tax.",subtotal+tax,Number(invoice.total_amount)||0);
    var paid=payments.filter(function(p){return String(p.invoice_id)===String(invoice.invoice_id);}).reduce(function(sum,p){return sum+(Number(p.amount)||0);},0);
    if(paid>(Number(invoice.total_amount)||0)+tolerance)issue("Invoice",invoice.invoice_id,"Recorded customer payments exceed invoice total.",Number(invoice.total_amount)||0,paid);
  });
  return {ok:issues.length===0,readOnly:true,issueCount:issues.length,checkCount:checks,issues:issues,
    methodology:"Read-only comparisons across procurement receipt transactions, harvest-to-lot links, fulfilment-to-dispatch movements, produce-lot balances and invoice line totals. It reports inconsistencies for review and never changes source records.",
    limitations:["This report does not repair records.","Produce-lot balance checks assume dispatch is the only movement type; lots with other movement types are excluded from that balance check.","It cannot guarantee that a multi-sheet write was atomic. Review source records before applying any correction."]};
}

function erpReport(reportKey, filters) {
  filters=filters||{};var start=filters.startDate||"0000-01-01",end=filters.endDate||"9999-12-31",farmId=filters.farmId;
  if(reportKey==="integrity"){
    var integrity=erpGetWorkflowIntegrityReport(farmId);
    return {ok:true,report:"integrity",period:{start:"All records",end:"All records"},summary:{issues:integrity.issueCount,checks:integrity.checkCount,passed:integrity.issueCount===0},rows:integrity.issues,methodology:integrity.methodology};
  }
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

function erpCancelCalendarOccurrenceUnlocked_(eventId,occurrenceStart,reason) {
  var event=erpFindByKey_("CalendarEvents","event_id",eventId);if(!event)throw new Error("Calendar event not found.");
  var existing=erpReadTable_("CalendarExceptions").find(function(x){return String(x.event_id)===String(eventId)&&String(x.occurrence_start)===String(occurrenceStart);});
  if(existing)erpUpdateByKey_("CalendarExceptions","calendar_exception_id",existing.calendar_exception_id,{exception_type:"cancel",reason:reason||"",created_at:new Date().toISOString()});
  else erpAppend_("CalendarExceptions",{event_id:eventId,occurrence_start:occurrenceStart,exception_type:"cancel",reason:reason||""});
  return {ok:true,cancelled:true};
}

function erpUpdateCalendarEventUnlocked_(eventId,scope,occurrenceStart,patch,reason) {
  var event=erpFindByKey_("CalendarEvents","event_id",eventId);if(!event)throw new Error("Calendar event not found.");
  patch=patch||{};
  if(scope==="single"){
    var exception=erpReadTable_("CalendarExceptions").find(function(x){return String(x.event_id)===String(eventId)&&String(x.occurrence_start)===String(occurrenceStart);});
    var merged=Object.assign({},patch);
    if(exception)erpUpdateByKey_("CalendarExceptions","calendar_exception_id",exception.calendar_exception_id,{exception_type:"override",override_json:JSON.stringify(merged),reason:reason||"",created_at:new Date().toISOString()});
    else erpAppend_("CalendarExceptions",{event_id:eventId,occurrence_start:occurrenceStart,exception_type:"override",override_json:JSON.stringify(merged),reason:reason||""});
    return {ok:true,scope:scope};
  }
  if(scope==="future"){
    var occurrenceDate=String(occurrenceStart).slice(0,10);
    var previous=new Date(occurrenceDate+"T00:00:00");
    previous.setDate(previous.getDate()-1);
    var previousDate=Utilities.formatDate(previous,Session.getScriptTimeZone(),"yyyy-MM-dd");
    erpUpdateByKey_("CalendarEvents","event_id",eventId,{recurrence_end:previousDate,updated_at:new Date().toISOString()});
    var split=Object.assign({},event,patch,{
      event_id:Utilities.getUuid(),
      start_at:patch.start_at||occurrenceStart,
      created_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    });
    delete split.event_id_original;
    var created=erpAppend_("CalendarEvents",split);
    return {ok:true,scope:scope,splitEvent:created};
  }
  var updated=erpUpdateByKey_("CalendarEvents","event_id",eventId,Object.assign({},patch,{updated_at:new Date().toISOString()}));
  return {ok:true,scope:"series",updated:updated};
}

function erpCreateTaskFromCalendarEvent(eventId,occurrenceStart,title,dueAt) {
  var event=erpFindByKey_("CalendarEvents","event_id",eventId);if(!event)throw new Error("Calendar event not found.");
  return erpAppend_("Tasks",{farm_id:event.farm_id,site_id:event.site_id,field_id:event.field_id,plot_id:event.plot_id,
    title:title||event.title,description:event.description,task_type:"calendar_follow_up",status:"planned",
    planned_start:occurrenceStart,due_at:dueAt||String(occurrenceStart).slice(0,10),created_by:erpActor_()});
}

/**
 * Serialises multi-sheet workflows and replays completed requests by key.
 * Apps Script Sheets writes are not atomic; this lock prevents concurrent
 * interleaving but does not roll back a partial write after a service failure.
 */
var ERP_WORKFLOW_TRACKING=false;
var ERP_WORKFLOW_WRITE_COUNT=0;

function erpRunLockedWorkflow_(action,requestKey,work) {
  var lock=LockService.getScriptLock();
  lock.waitLock(30000);
  var marker=null;
  try {
    var prior=requestKey&&erpIdempotentResult_(requestKey,action);
    if(prior)return prior;
    if(requestKey){
      var existing=erpFindByKey_("IdempotencyKeys","request_key",requestKey);
      var now=new Date().toISOString();
      if(existing&&String(existing.status)==="rejected"){
        marker=erpUpdateByKey_("IdempotencyKeys","idempotency_id",existing.idempotency_id,{status:"in_progress",started_at:now,completed_at:"",error_message:""});
      }else if(!existing){
        marker=erpAppend_("IdempotencyKeys",{request_key:requestKey,action:action,status:"in_progress",started_at:now,created_at:now});
      }else{
        throw new Error("Request key already exists in a non-retryable state.");
      }
    }
    ERP_WORKFLOW_WRITE_COUNT=0;
    ERP_WORKFLOW_TRACKING=true;
    try {
      var result=work();
      if(requestKey)erpStoreIdempotency_(requestKey,action,result);
      return result;
    } catch(error) {
      var partialWrite=ERP_WORKFLOW_WRITE_COUNT>0;
      ERP_WORKFLOW_TRACKING=false;
      if(marker) {
        try { erpUpdateByKey_("IdempotencyKeys","idempotency_id",marker.idempotency_id,{
          status:partialWrite?"failed":"rejected",
          error_message:String(error&&error.message||error)
        }); }
        catch(markError) { console.error("Unable to mark workflow request outcome: "+markError.message); }
      }
      throw error;
    } finally {
      ERP_WORKFLOW_TRACKING=false;
    }
  } finally {
    lock.releaseLock();
  }
}

function erpCancelCalendarOccurrence(eventId,occurrenceStart,reason,requestKey){return erpRunLockedWorkflow_("erpCancelCalendarOccurrence",requestKey,function(){return erpCancelCalendarOccurrenceUnlocked_(eventId,occurrenceStart,reason);});}

function erpUpdateCalendarEvent(eventId,scope,occurrenceStart,patch,reason,requestKey){return erpRunLockedWorkflow_("erpUpdateCalendarEvent",requestKey,function(){return erpUpdateCalendarEventUnlocked_(eventId,scope,occurrenceStart,patch,reason);});}
