/**
 * Production planning and crop execution services.
 * Forecast and observed data are deliberately stored in separate fields.
 */

function erpDateKey_(value){
  if(!value)return "";
  const d=value instanceof Date?value:new Date(value);
  if(isNaN(d.getTime()))return String(value).slice(0,10);
  return Utilities.formatDate(d,Session.getScriptTimeZone(),"yyyy-MM-dd");
}
function erpAddDays_(dateValue,days){
  const d=new Date(dateValue);
  if(isNaN(d.getTime()))throw new Error("A valid crop-cycle anchor date is required.");
  d.setDate(d.getDate()+Number(days||0));
  return Utilities.formatDate(d,Session.getScriptTimeZone(),"yyyy-MM-dd");
}
function erpGetRecord_(table,id){
  const key=ERP_KEYS[table];
  if(!key)throw new Error("Unsupported record type.");
  const result=erpList(table,{limit:1000,filter:{[key]:String(id)}});
  if(!result.rows.length)throw new Error(table+" record not found.");
  return result.rows[0];
}

/** Preview only: a task series never assigns workers or implies execution. */
function erpPreviewCropTasks(cropCycleId){
  const cycle=erpGetRecord_("CropCycles",cropCycleId);
  const templates=erpRead_("TaskTemplates",{limit:1000}).rows.filter(t=>
    String(t.status||"active").toLowerCase()!=="inactive" &&
    (!t.farm_id||String(t.farm_id)===String(cycle.farm_id)) &&
    (!t.crop_id||String(t.crop_id)===String(cycle.crop_id)) &&
    (!t.variety_id||String(t.variety_id)===String(cycle.variety_id))
  );
  const existing=erpRead_("Tasks",{limit:1000,farmId:cycle.farm_id}).rows;
  const planned=[];
  templates.forEach(template=>{
    const trigger=String(template.trigger_type||"start").toLowerCase();
    const anchor=trigger.indexOf("transplant")>=0?(cycle.transplant_date||cycle.start_date):
      trigger.indexOf("sow")>=0?(cycle.sowing_date||cycle.start_date):
      trigger.indexOf("nursery")>=0?(cycle.nursery_date||cycle.start_date):
      (cycle.start_date||cycle.transplant_date||cycle.sowing_date);
    const firstOffset=Number(template.trigger_offset_days)||0;
    let interval=0,count=1;
    if(template.recurrence_rule){
      try{
        const rule=JSON.parse(template.recurrence_rule);
        interval=Number(rule.interval_days||rule.intervalDays||0);
        count=Math.min(120,Math.max(1,Number(rule.occurrences||rule.count||1)));
      }catch(e){
        const match=String(template.recurrence_rule).match(/every\s+(\d+)\s+days?/i);
        if(match){interval=Number(match[1]);count=Number((String(template.recurrence_rule).match(/for\s+(\d+)\s+times?/i)||[])[1]||1);}
      }
    }
    for(let n=0;n<count;n++){
      const due=erpAddDays_(anchor,firstOffset+(interval*n));
      const duplicate=existing.some(t=>String(t.crop_cycle_id)===String(cropCycleId)&&
        String(t.template_id)===String(template.template_id)&&erpDateKey_(t.due_at)===due);
      planned.push({
        crop_cycle_id:cropCycleId,farm_id:cycle.farm_id,field_id:cycle.field_id,plot_id:cycle.plot_id,
        template_id:template.template_id,title:template.template_name,
        task_type:template.task_type||"crop_operation",priority:template.default_priority||"normal",
        status:"planned",planned_start:due,due_at:due,
        estimated_duration_minutes:template.default_duration_minutes||"",
        already_exists:duplicate,series_occurrence:n+1
      });
    }
  });
  planned.sort((a,b)=>String(a.due_at).localeCompare(String(b.due_at)));
  return {ok:true,cropCycleId:cropCycleId,cycleName:cycle.cycle_name||cycle.crop_cycle_id,
    plannedCount:planned.length,existingCount:planned.filter(t=>t.already_exists).length,
    tasks:planned,notice:"Preview only. Worker assignments and actual execution remain separate."};
}

/** Commit an approved preview; unique cycle/template/date keys prevent duplicate tasks. */
function erpGenerateCropTasks(cropCycleId){
  const preview=erpPreviewCropTasks(cropCycleId),created=[],skipped=[];
  preview.tasks.forEach(task=>{
    if(task.already_exists){skipped.push(task);return;}
    delete task.already_exists;delete task.series_occurrence;
    try{created.push(erpSave("Tasks",task));}
    catch(error){
      if(String(error.message||error).toLowerCase().indexOf("already exists")>=0)skipped.push(task);
      else throw error;
    }
  });
  return {ok:true,createdCount:created.length,skippedCount:skipped.length,created:created,skipped:skipped};
}

/** Create a follow-up task only after an explicit user action from a scouting observation. */
function erpCreateTaskFromObservation(observationId,taskTitle,dueAt,priority){
  if(!taskTitle)throw new Error("Task title is required.");
  const o=erpGetRecord_("Observations",observationId);
  const result=erpSave("Tasks",{
    farm_id:o.farm_id,field_id:o.field_id,plot_id:o.plot_id,crop_cycle_id:o.crop_cycle_id,
    title:taskTitle,description:"Follow-up from observation "+observationId+
      (o.description?" — "+o.description:""),
    task_type:"scouting_follow_up",priority:priority||"normal",status:"ready",
    due_at:dueAt||"",created_by:erpActor_()
  });
  erpSave("Observations",{observation_id:observationId,resulting_task_id:result.id});
  return {ok:true,task:result};
}

/** Observed crop stage and forecast stage are not interchangeable. */
function erpUpdateCropStage(cropCycleId,stageType,stage,observedAt){
  if(!stage)throw new Error("A stage value is required.");
  const type=String(stageType||"").toLowerCase();
  if(type!=="observed"&&type!=="forecast")throw new Error("Stage type must be observed or forecast.");
  const record={crop_cycle_id:cropCycleId};
  if(type==="observed"){
    record.observed_stage=stage;
    record.stage_observed_at=observedAt||new Date();
  }else{
    record.forecast_stage=stage;
  }
  return erpSave("CropCycles",record);
}

function erpInPeriod_(value,startDate,endDate){
  const key=erpDateKey_(value);
  return !!key&&key>=startDate&&key<=endDate;
}
function erpBucket_(map,cropId,unit,cropName){
  const key=String(cropId||"unclassified")+"|"+String(unit||"");
  if(!map[key])map[key]={crop_id:cropId||"",crop_name:cropName||"Unclassified",unit:unit||"",
    confirmed_demand:0,forecast_demand:0,available_stock:0,projected_crop_supply:0,
    supply_basis:[],confidence:"unknown"};
  return map[key];
}

/**
 * Demand-to-production projection:
 * - confirmed order balances and forecast demand remain separate;
 * - lot stock is reduced by explicit lot reservations;
 * - crop-cycle projection subtracts harvested-to-date before adding future yield;
 * - no unrecorded unit conversions or speculative allocations are made.
 */
function erpCalculateProductionGap(farmId,startDate,endDate){
  const start=erpDateKey_(startDate||new Date());
  const end=erpDateKey_(endDate||erpAddDays_(new Date(),30));
  if(!start||!end||end<start)throw new Error("A valid planning date range is required.");
  const buckets={},cropsById={},productsById={},varietiesById={},profiles=[];
  erpRead_("Crops",{limit:1000}).rows.forEach(c=>cropsById[c.crop_id]=c);
  erpRead_("Products",{limit:1000}).rows.forEach(p=>productsById[p.product_id]=p);
  erpRead_("Varieties",{limit:1000}).rows.forEach(v=>varietiesById[v.variety_id]=v);
  erpRead_("CropProfiles",{limit:1000}).rows.forEach(p=>profiles.push(p));
  const farmRows=arr=>farmId?arr.filter(r=>String(r.farm_id)===String(farmId)):arr;

  const demandRows=farmRows(erpRead_("DemandRecords",{limit:1000}).rows);
  const orders=farmRows(erpRead_("SalesOrders",{limit:1000}).rows)
    .filter(o=>!["draft","cancelled","closed"].includes(String(o.status||"").toLowerCase()));
  const represented=new Set();
  demandRows.forEach(d=>{if(d.source_reference)represented.add(String(d.source_reference));});
  const orderById={};orders.forEach(o=>orderById[o.sales_order_id]=o);
  const orderLines=erpRead_("SalesOrderLines",{limit:1000}).rows.filter(l=>orderById[l.sales_order_id]);
  orderLines.forEach(line=>{
    const order=orderById[line.sales_order_id];
    if(!erpInPeriod_(order.required_date||order.order_date,start,end))return;
    const product=productsById[line.product_id]||{};
    const cropId=product.crop_id||"";
    if(!cropId)return;
    const crop=cropsById[cropId]||{};
    const remaining=Math.max(0,(Number(line.quantity_ordered)||0)-(Number(line.quantity_fulfilled)||0));
    if(!remaining)return;
    const b=erpBucket_(buckets,cropId,line.unit||product.base_unit,crop.crop_name);
    b.confirmed_demand+=remaining;
    b.supply_basis.push("Confirmed sales order "+(order.order_number||order.sales_order_id));
  });
  demandRows.forEach(d=>{
    if(!erpInPeriod_(d.required_date||d.period_start,start,end))return;
    const type=String(d.demand_type||"forecast").toLowerCase();
    const crop=cropsById[d.crop_id]||{};
    const b=erpBucket_(buckets,d.crop_id,d.unit,crop.crop_name);
    const q=Number(d.quantity)||0;
    if(type==="forecast"||type==="forecast_demand")b.forecast_demand+=q;
    else if(type==="confirmed"||type==="standing"||type==="confirmed_order"){
      if(d.source_reference&&orderById[d.source_reference])return;
      b.confirmed_demand+=q;
    }else b.forecast_demand+=q;
  });

  const reservedByLot={};
  orderLines.forEach(l=>{
    if(!l.produce_lot_id)return;
    const order=orderById[l.sales_order_id];
    if(!erpInPeriod_(order.required_date||order.order_date,start,end))return;
    reservedByLot[l.produce_lot_id]=(reservedByLot[l.produce_lot_id]||0)+
      Math.max(0,(Number(l.quantity_ordered)||0)-(Number(l.quantity_fulfilled)||0));
  });
  const lots=farmRows(erpRead_("ProduceLots",{limit:1000}).rows);
  lots.forEach(lot=>{
    if(["inactive","quarantine","wastage"].includes(String(lot.status||"").toLowerCase()))return;
    const available=Math.max(0,(Number(lot.quantity_available)||0)-(reservedByLot[lot.produce_lot_id]||0));
    if(!available)return;
    const crop=cropsById[lot.crop_id]||{};
    erpBucket_(buckets,lot.crop_id,lot.unit,crop.crop_name).available_stock+=available;
  });

  const cycles=farmRows(erpRead_("CropCycles",{limit:1000}).rows).filter(c=>
    erpInPeriod_(c.expected_end_date,start,end)&&
    !["terminated","cancelled","completed"].includes(String(c.status||"").toLowerCase()));
  const sessionById={},sessions=erpRead_("HarvestSessions",{limit:1000}).rows;
  sessions.forEach(h=>sessionById[h.harvest_id]=h);
  const harvestedByCycle={};
  erpRead_("HarvestLines",{limit:1000}).rows.forEach(line=>{
    const session=sessionById[line.harvest_id];
    if(!session||!session.crop_cycle_id)return;
    const key=session.crop_cycle_id+"|"+String(line.unit||"");
    harvestedByCycle[key]=(harvestedByCycle[key]||0)+(Number(line.quantity)||0);
  });
  cycles.forEach(c=>{
    const crop=cropsById[c.crop_id]||{},variety=varietiesById[c.variety_id]||{};
    const profile=profiles.find(p=>String(p.crop_id)===String(c.crop_id)&&
      (!p.variety_id||String(p.variety_id)===String(c.variety_id))&&
      (!p.status||String(p.status).toLowerCase()!=="inactive"));
    const rate=Number(profile&&profile.expected_yield||variety.expected_yield||0);
    const yieldUnit=(profile&&profile.yield_unit)||variety.yield_unit||crop.default_unit||"";
    const area=Number(c.area_value)||0;
    if(!(rate>0&&area>0))return;
    const total=rate*area;
    const harvested=harvestedByCycle[c.crop_cycle_id+"|"+yieldUnit]||0;
    const remaining=Math.max(0,total-harvested);
    if(!remaining)return;
    const b=erpBucket_(buckets,c.crop_id,yieldUnit,crop.crop_name);
    b.projected_crop_supply+=remaining;
    b.supply_basis.push("Crop cycle "+(c.cycle_name||c.crop_cycle_id)+" ("+
      (profile?"configured crop profile":"variety estimate")+")");
    const confidence=String(profile&&profile.assumption_basis||"manager_estimate").toLowerCase();
    if(confidence==="farm_history"||confidence==="historical_actuals")b.confidence="medium";
    else if(b.confidence==="unknown")b.confidence="low";
  });

  const rows=Object.keys(buckets).map(k=>{
    const b=buckets[k],supply=b.available_stock+b.projected_crop_supply;
    return Object.assign({},b,{
      total_demand:b.confirmed_demand+b.forecast_demand,
      total_projected_supply:supply,
      gap_confirmed:b.confirmed_demand-supply,
      gap_including_forecast:b.confirmed_demand+b.forecast_demand-supply,
      supply_basis:[...new Set(b.supply_basis)],
      confidence:b.confidence
    });
  }).sort((a,b)=>Math.abs(b.gap_including_forecast)-Math.abs(a.gap_including_forecast));
  return {ok:true,farmId:farmId||"",period:{start:start,end:end},rows:rows,
    methodology:"Confirmed orders and forecast records are separate. Available saleable produce is reduced by explicit lot reservations. Crop-cycle projections use configured crop-profile or variety yield assumptions less recorded harvest-to-date. Quantities are grouped by crop and unit; no implicit unit conversions are performed.",
    limitations:["Crop-yield projections are only calculated where an area and yield assumption are configured.","Forecast confidence is based on the recorded assumption basis; unavailable source data is not invented.","Order demand is derived from remaining sales-order quantities and should not be entered again as a forecast record."]};
}
