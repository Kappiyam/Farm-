/**
 * FarmERP transaction workflows: procurement receipt, harvest lot creation,
 * produce dispatch, sales fulfilment and invoicing.
 */
function erpFindOne_(table,filter){
  const found=erpList(table,{limit:1000,filter:filter}).rows;
  return found.length?found[0]:null;
}

function erpProduceLotBalance_(lotId){
  const moves=erpRead_("ProduceLotMovements",{limit:1000}).rows.filter(m=>String(m.produce_lot_id)===String(lotId));
  return moves.reduce((sum,m)=>{
    const type=String(m.movement_type||"").toLowerCase(),q=Number(m.quantity)||0;
    if(["receipt","return_in","production_in","adjustment_in"].includes(type))return sum+q;
    if(["dispatch","sale","processing_out","internal_use","wastage","quarantine_out","adjustment_out"].includes(type))return sum-q;
    return sum;
  },0);
}

/** Recalculate a convenience quantity snapshot from the authoritative lot ledger. */
function erpUpdateProduceLotSnapshot_(lotId){
  const lot=erpFindOne_("ProduceLots",{produce_lot_id:String(lotId)});
  if(!lot)return;
  const balance=erpProduceLotBalance_(lotId);
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ProduceLots");
  if(sh.getLastRow()<2)return;
  const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  const rowIndex=sh.getRange(2,headers.indexOf("produce_lot_id")+1,sh.getLastRow()-1,1)
    .getDisplayValues().findIndex(r=>String(r[0])===String(lotId));
  if(rowIndex<0)return;
  const quantityCol=headers.indexOf("quantity_available")+1;
  if(quantityCol>0)sh.getRange(rowIndex+2,quantityCol).setValue(balance);
}

/** Receive a procurement line. Stock increases only after this confirmed receipt. */
function erpReceiveProcurement(procurementId,receipts){
  if(!Array.isArray(receipts)||!receipts.length)throw new Error("At least one receipt line is required.");
  const order=erpGetRecord_("ProcurementOrders",procurementId);
  if(["cancelled","closed"].includes(String(order.status||"").toLowerCase()))throw new Error("This procurement order is closed.");
  const results=[];
  receipts.forEach((r,index)=>{
    const line=erpGetRecord_("ProcurementLines",r.procurement_line_id);
    if(String(line.procurement_id)!==String(procurementId))throw new Error("Receipt line does not belong to this procurement order.");
    const qty=Number(r.quantity);
    if(!(qty>0))throw new Error("Receipt quantity must be greater than zero.");
    const item=erpGetRecord_("InventoryItems",line.item_id);
    const lotCode=String(r.lot_code||"").trim();
    if(!lotCode)throw new Error("Lot/batch code is required for received stock.");
    let lot=erpFindOne_("StockLots",{item_id:line.item_id,lot_code:lotCode});
    if(!lot){
      const saved=erpSave("StockLots",{
        farm_id:order.farm_id,item_id:line.item_id,lot_code:lotCode,source_type:"procurement",
        source_reference:procurementId,received_date:r.received_date||new Date(),
        expiry_date:r.expiry_date||"",storage_location:r.storage_location||line.storage_location||"",
        supplier_id:order.supplier_id,unit_cost:r.unit_cost===undefined?line.unit_cost:r.unit_cost,
        currency_code:order.currency_code,status:"active"
      });
      lot=saved.record;
    }
    const key="procurement:"+procurementId+":"+line.procurement_line_id+":"+lotCode+":"+qty;
    const prior=erpFindOne_("IdempotencyKeys",{idempotency_key:key});
    const outstanding=Math.max(0,(Number(line.quantity_ordered)||0)-(Number(line.quantity_received)||0));
    if(!prior&&qty>outstanding+0.000001)
      throw new Error("Receipt exceeds the outstanding ordered quantity for "+line.description+".");
    const posted=erpPostLedger("InventoryTransactions",{
      farm_id:order.farm_id,item_id:line.item_id,lot_id:lot.lot_id,transaction_type:"receipt",
      quantity:qty,unit:r.unit||line.unit,unit_cost:r.unit_cost===undefined?line.unit_cost:r.unit_cost,
      transaction_at:r.received_date||new Date(),to_location:r.storage_location||line.storage_location||"",
      reference_type:"ProcurementLine",reference_id:line.procurement_line_id,
      reason:r.notes||"Confirmed physical receipt"
    },key);
    // Reconcile line quantity from the posted ledger, so retries cannot increment twice.
    const received=erpRead_("InventoryTransactions",{limit:1000}).rows.filter(t=>
      String(t.reference_type)==="ProcurementLine"&&String(t.reference_id)===String(line.procurement_line_id)&&
      ["receipt","return_in"].includes(String(t.transaction_type).toLowerCase()))
      .reduce((sum,t)=>sum+(Number(t.quantity)||0),0);
    erpSetCalculatedField_("ProcurementLines",line.procurement_line_id,"quantity_received",received,"Confirmed stock receipt ledger");
    results.push({procurement_line_id:line.procurement_line_id,lot_id:lot.lot_id,posted:posted,received_total:received,item_name:item.item_name});
  });
  const lines=erpRead_("ProcurementLines",{limit:1000,filter:{procurement_id:procurementId}}).rows;
  const anyReceived=lines.some(l=>Number(l.quantity_received)>0);
  const allReceived=lines.length>0&&lines.every(l=>(Number(l.quantity_received)||0)+0.000001>=(Number(l.quantity_ordered)||0));
  const status=allReceived?"received":anyReceived?"partially_received":"ordered";
  erpSave("ProcurementOrders",{procurement_id:procurementId,status:status,received_date:new Date()});
  return {ok:true,procurementId:procurementId,status:status,allLinesReceived:allReceived,lines:results};
}

/** Finalise a harvest session and create traceable produce lots for sale/process stock. */
function erpFinalizeHarvest(harvestId,lines,requestKey){
  const session=erpGetRecord_("HarvestSessions",harvestId);
  if(String(session.status).toLowerCase()==="completed"){
    return {ok:true,alreadyCompleted:true,harvestId:harvestId,
      lines:erpRead_("HarvestLines",{limit:1000,filter:{harvest_id:harvestId}}).rows};
  }
  if(!Array.isArray(lines)||!lines.length)throw new Error("Harvest quantity/grade lines are required.");
  const base=requestKey||("harvest-finalize:"+harvestId),saved=[];
  lines.forEach((line,index)=>{
    const qty=Number(line.quantity);
    if(!(qty>0))throw new Error("Harvest quantity must be greater than zero.");
    const disposition=String(line.disposition||"sale").toLowerCase();
    let lot=null;
    if(["sale","processing","saleable"].includes(disposition)){
      const lotCode=String(line.lot_code||("H-"+String(harvestId).slice(-6)+"-"+(index+1)));
      lot=erpFindOne_("ProduceLots",{farm_id:session.farm_id,lot_code:lotCode});
      if(!lot){
        lot=erpSave("ProduceLots",{
          farm_id:session.farm_id,crop_id:line.crop_id,variety_id:line.variety_id||"",
          source_plot_id:session.plot_id,source_cycle_id:session.crop_cycle_id,lot_code:lotCode,
          grade:line.grade||"",quantity_available:0,unit:line.unit,
          harvest_date:session.harvest_date,storage_location:line.storage_location||"",
          quality_status:line.quality_status||"unassessed",status:"active"
        }).record;
      }
      erpPostLedger("ProduceLotMovements",{
        produce_lot_id:lot.produce_lot_id,movement_type:"receipt",quantity:qty,unit:line.unit,
        occurred_at:session.harvest_date||new Date(),reference_type:"HarvestSession",reference_id:harvestId,
        reason:"Harvest received into produce lot"
      },base+":lot:"+index+":receipt");
    }
    const refKey=base+":line:"+index;
    const existing=erpFindOne_("HarvestLines",{harvest_id:harvestId,line_reference_key:refKey});
    if(!existing){
      erpPostLedger("HarvestLines",{
        harvest_id:harvestId,crop_id:line.crop_id,variety_id:line.variety_id||"",
        grade:line.grade||"",quantity:qty,unit:line.unit,disposition:disposition,
        produce_lot_id:lot?lot.produce_lot_id:"",line_reference_key:refKey,notes:line.notes||""
      },refKey);
    }
    saved.push({lineReference:refKey,produceLotId:lot?lot.produce_lot_id:"",quantity:qty,unit:line.unit,disposition:disposition});
  });
  const complete=erpSave("HarvestSessions",{harvest_id:harvestId,status:"completed"});
  return {ok:true,harvestId:harvestId,status:"completed",session:complete.record,lines:saved};
}

/** Available quantity is based on append-only produce-lot movements. */
function erpGetProduceLotBalance(lotId){
  const lot=erpGetRecord_("ProduceLots",lotId);
  return {ok:true,lotId:lotId,lotCode:lot.lot_code,unit:lot.unit,
    availableQuantity:erpProduceLotBalance_(lotId)};
}

/** Fulfil an order from identified produce lots. Saleable stock is reduced by ledger movement. */
function erpFulfilSalesOrder(orderId,fulfilmentReference,lines,fulfilmentDate){
  if(!fulfilmentReference)throw new Error("A stable fulfilment reference is required for safe retries.");
  if(!Array.isArray(lines)||!lines.length)throw new Error("At least one fulfilment line is required.");
  const order=erpGetRecord_("SalesOrders",orderId);
  if(["cancelled","closed"].includes(String(order.status||"").toLowerCase()))throw new Error("This sales order is closed.");
  let header=erpFindOne_("Fulfilments",{fulfilment_reference:fulfilmentReference});
  if(header&&String(header.sales_order_id)!==String(orderId))throw new Error("Fulfilment reference is already used by another order.");
  if(!header)header=erpSave("Fulfilments",{
    sales_order_id:orderId,fulfilment_date:fulfilmentDate||new Date(),
    fulfilment_reference:fulfilmentReference,status:"in_progress",notes:"Order fulfilment"
  }).record;
  const results=[];
  lines.forEach((line,index)=>{
    const salesLine=erpGetRecord_("SalesOrderLines",line.sales_line_id);
    if(String(salesLine.sales_order_id)!==String(orderId))throw new Error("Sales line does not belong to this order.");
    const qty=Number(line.quantity);
    if(!(qty>0))throw new Error("Fulfilment quantity must be greater than zero.");
    const lot=erpGetRecord_("ProduceLots",line.produce_lot_id);
    if(String(lot.farm_id)!==String(order.farm_id))throw new Error("Produce lot belongs to another farm.");
    const existing=erpFindOne_("FulfilmentLines",{
      fulfilment_id:header.fulfilment_id,sales_line_id:line.sales_line_id,produce_lot_id:line.produce_lot_id
    });
    if(existing){results.push({lineId:existing.fulfilment_line_id,duplicate:true});return;}
    const currentFulfilled=erpRead_("FulfilmentLines",{limit:1000}).rows.filter(fl=>String(fl.sales_line_id)===String(line.sales_line_id))
      .reduce((sum,fl)=>sum+(Number(fl.quantity)||0),0);
    const remaining=(Number(salesLine.quantity_ordered)||0)-currentFulfilled;
    if(qty>remaining+0.000001)throw new Error("Fulfilment exceeds the unfulfilled order quantity.");
    const key="fulfilment:"+fulfilmentReference+":"+line.sales_line_id+":"+line.produce_lot_id;
    erpPostLedger("ProduceLotMovements",{
      produce_lot_id:line.produce_lot_id,movement_type:"dispatch",quantity:qty,unit:line.unit||lot.unit,
      occurred_at:fulfilmentDate||new Date(),reference_type:"Fulfilment",reference_id:header.fulfilment_id,
      reason:"Produce dispatched against sales order "+(order.order_number||orderId)
    },key);
    const saved=erpSave("FulfilmentLines",{
      fulfilment_id:header.fulfilment_id,sales_line_id:line.sales_line_id,
      produce_lot_id:line.produce_lot_id,quantity:qty,unit:line.unit||lot.unit,idempotency_key:key
    });
    results.push({lineId:saved.id,duplicate:false,quantity:qty,unit:line.unit||lot.unit});
  });
  // Recompute fulfilled quantities from fulfilment lines, never from a button-tap increment.
  const orderLines=erpRead_("SalesOrderLines",{limit:1000,filter:{sales_order_id:orderId}}).rows;
  let complete=true;
  orderLines.forEach(line=>{
    const fulfilled=erpRead_("FulfilmentLines",{limit:1000,filter:{sales_line_id:line.sales_line_id}}).rows
      .reduce((sum,x)=>sum+(Number(x.quantity)||0),0);
    erpSetCalculatedField_("SalesOrderLines",line.sales_line_id,"quantity_fulfilled",fulfilled,"Fulfilment line reconciliation");
    if(fulfilled+0.000001<(Number(line.quantity_ordered)||0))complete=false;
  });
  const newStatus=complete?"fulfilled":"partially_fulfilled";
  erpSave("Fulfilments",{fulfilment_id:header.fulfilment_id,status:"completed"});
  erpSave("SalesOrders",{sales_order_id:orderId,status:newStatus});
  return {ok:true,fulfilmentId:header.fulfilment_id,orderStatus:newStatus,lines:results};
}

function erpNextInvoiceNumber_(){
  return erpWithLock_(()=>{
    const props=PropertiesService.getScriptProperties();
    const year=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yy");
    const key="FARMERP_INVOICE_SEQ_"+year;
    const next=(Number(props.getProperty(key))||0)+1;
    props.setProperty(key,String(next));
    return "INV-"+year+"-"+String(next).padStart(5,"0");
  });
}

/** Create invoice lines only for fulfilled quantities that have not already been invoiced. */
function erpCreateInvoiceFromOrder(orderId,dueDate){
  const order=erpGetRecord_("SalesOrders",orderId);
  const orderLines=erpRead_("SalesOrderLines",{limit:1000,filter:{sales_order_id:orderId}}).rows;
  const invoiceLines=erpRead_("InvoiceLines",{limit:1000}).rows;
  const pending=[];
  orderLines.forEach(line=>{
    const already=invoiceLines.filter(x=>String(x.sales_line_id)===String(line.sales_line_id))
      .reduce((sum,x)=>sum+(Number(x.quantity)||0),0);
    const qty=Math.max(0,(Number(line.quantity_fulfilled)||0)-already);
    if(qty>0)pending.push({line:line,quantity:qty,unitPrice:Number(line.unit_price)||0,
      amount:qty*(Number(line.unit_price)||0)});
  });
  if(!pending.length)throw new Error("There are no newly fulfilled quantities available to invoice.");
  const subtotal=pending.reduce((sum,x)=>sum+x.amount,0);
  const invoice=erpSave("Invoices",{
    farm_id:order.farm_id,customer_id:order.customer_id,sales_order_id:orderId,
    invoice_number:erpNextInvoiceNumber_(),invoice_date:new Date(),due_date:dueDate||"",
    status:"issued",currency_code:order.currency_code,subtotal:subtotal,tax_amount:0,total_amount:subtotal
  }).record;
  pending.forEach(x=>erpSave("InvoiceLines",{
    invoice_id:invoice.invoice_id,sales_line_id:x.line.sales_line_id,product_id:x.line.product_id,
    description:x.line.description||"",quantity:x.quantity,unit:x.line.unit,
    unit_price:x.unitPrice,line_total:x.amount
  }));
  return {ok:true,invoice:invoice,lines:pending.length,total:subtotal,currency:order.currency_code};
}
