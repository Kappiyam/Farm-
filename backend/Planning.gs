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
function erpGenerateCropTasks(cropCycleId,requestKey){
  if(!requestKey)throw new Error("A stable crop-task generation request key is required.");
  const preview=erpPreviewCropTasks(cropCycleId),created=[],skipped=[];
  preview.tasks.forEach(task=>{
    if(task.already_exists){skipped.push(task);return;}
    delete task.already_exists;delete task.series_occurrence;
    try{created.push(erpSave("Tasks",task,requestKey+":"+task.template_id+":"+task.due_at));}
    catch(error){
      if(String(error.message||error).toLowerCase().indexOf("already exists")>=0)skipped.push(task);
      else throw error;
    }
  });
  return {ok:true,createdCount:created.length,skippedCount:skipped.length,created:created,skipped:skipped};
}

/** Create a follow-up task only after an explicit user action from a scouting observation. */
function erpCreateTaskFromObservation(observationId,taskTitle,dueAt,priority,requestKey){
  if(!requestKey)throw new Error("A stable observation follow-up request key is required.");
  if(!taskTitle)throw new Error("Task title is required.");
  const o=erpGetRecord_("Observations",observationId);
  const result=erpSave("Tasks",{
    farm_id:o.farm_id,field_id:o.field_id,plot_id:o.plot_id,crop_cycle_id:o.crop_cycle_id,
    title:taskTitle,description:"Follow-up from observation "+observationId+
      (o.description?" — "+o.description:""),
    task_type:"scouting_follow_up",priority:priority||"normal",status:"ready",
    due_at:dueAt||"",created_by:erpActor_()
  },requestKey);
  erpSave("Observations",{observation_id:observationId,resulting_task_id:result.id},requestKey+":observation-link");
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
function erpBucket_(map,cropId,unit,cropName,varietyId,varietyName,grade){
  const key=[cropId||"unclassified",varietyId||"",grade||"",unit||""].join("|");
  if(!map[key])map[key]={crop_id:cropId||"",crop_name:cropName||"Unclassified",
    variety_id:varietyId||"",variety_name:varietyName||"",grade:grade||"",unit:unit||"",
    confirmed_demand:0,forecast_demand:0,available_stock:0,projected_crop_supply:0,
    supply_basis:[],confidence:"unknown",data_warnings:[]};
  return map[key];
}
function erpProductionJson_(value){
  if(value&&typeof value==="object")return value;
  if(!value)return {};
  try{const parsed=JSON.parse(String(value));return parsed&&typeof parsed==="object"?parsed:{};}catch(e){return {};}
}
function erpProductionProfile_(profiles,cropId,varietyId,productionSystem){
  const candidates=profiles.filter(p=>String(p.crop_id)===String(cropId)&&
    (!p.variety_id||String(p.variety_id)===String(varietyId||""))&&
    String(p.status||"active").toLowerCase()!=="inactive"&&
    (!productionSystem||!p.production_system||String(p.production_system)===String(productionSystem)));
  candidates.sort((a,b)=>{
    const ae=String(a.variety_id||"")===String(varietyId||"")?1:0;
    const be=String(b.variety_id||"")===String(varietyId||"")?1:0;
    return be-ae;
  });
  return candidates[0]||null;
}
function erpProductionAreaIn_(value,fromUnit,toUnit){
  const factors={acre:4046.8564224,acres:4046.8564224,ha:10000,hectare:10000,hectares:10000,
    cent:40.468564224,cents:40.468564224,sqft:0.09290304,sq_ft:0.09290304,"sq ft":0.09290304,
    sqm:1,m2:1,"sq m":1};
  const from=String(fromUnit||"").toLowerCase().trim(),to=String(toUnit||"").toLowerCase().trim();
  if(!from||!to||!factors[from]||!factors[to])return null;
  return Number(value)*factors[from]/factors[to];
}
function erpProductionSpacingDensity_(variety){
  const row=Number(variety&&variety.spacing_row),plant=Number(variety&&variety.spacing_plant);
  const unit=String(variety&&variety.spacing_unit||"").toLowerCase().trim();
  if(!(row>0&&plant>0))return null;
  const metres={m:1,meter:1,meters:1,metre:1,metres:1,cm:0.01,mm:0.001,
    ft:0.3048,feet:0.3048,foot:0.3048,in:0.0254,inch:0.0254,inches:0.0254};
  if(!metres[unit])return null;
  const squareMetres=row*metres[unit]*plant*metres[unit];
  return 10000/squareMetres;
}
function erpProductionEligibleCycle_(cycle,today){
  const status=String(cycle.status||"").toLowerCase().trim();
  if(["terminated","cancelled","completed","abandoned","draft","proposed","inactive","rejected"].includes(status))return false;
  if(["approved","active","planted","established","vegetative","flowering","fruiting","harvesting","in_production","ratoon"].includes(status))return true;
  // Legacy active cycles without an explicit status are retained only when already established.
  return !status&&!!cycle.start_date&&erpDateKey_(cycle.start_date)<=today;
}
function erpProductionDateOverlap_(startValue,endValue,startDate,endDate){
  const a=erpDateKey_(startValue),b=erpDateKey_(endValue||startValue);
  return !!a&&!!b&&a<=endDate&&b>=startDate;
}
function erpProductionRate_(profile,variety,cycle){
  if(cycle&&Number(cycle.forecast_yield)>0){
    return {total:Number(cycle.forecast_yield),unit:cycle.yield_unit||profile&&profile.yield_unit||variety&&variety.yield_unit||"",
      source:cycle.forecast_basis||"cycle_forecast",basis:"cycle_total"};
  }
  const source=profile&&Number(profile.expected_yield)>0?profile:variety&&Number(variety.expected_yield)>0?variety:null;
  if(!source)return null;
  const basis=String(source.yield_basis||"per_area").toLowerCase();
  const unit=source.yield_unit||cycle&&cycle.yield_unit||"";
  if(basis==="per_plant"){
    const plants=Number(cycle&&cycle.plant_count)||0;
    if(!(plants>0))return null;
    return {total:Number(source.expected_yield)*plants,unit:unit,source:profile?"crop_profile":"variety_reference",basis:basis};
  }
  if(basis==="per_area"){
    const area=Number(cycle&&cycle.area_value)||0,areaUnit=cycle&&cycle.area_unit||source.yield_area_unit||"";
    if(!(area>0))return null;
    if(source.yield_area_unit&&cycle&&cycle.area_unit&&String(source.yield_area_unit)!==String(cycle.area_unit)){
      const converted=erpProductionAreaIn_(area,cycle.area_unit,source.yield_area_unit);
      if(converted===null)return null;
      return {total:Number(source.expected_yield)*converted,unit:unit,source:profile?"crop_profile":"variety_reference",basis:basis};
    }
    return {total:Number(source.expected_yield)*area,unit:unit,source:profile?"crop_profile":"variety_reference",basis:basis};
  }
  return null;
}
function erpProductionRequirements_(row,profile,variety,startDate){
  const rates=erpProductionJson_(profile&&profile.resource_rates_json);
  const selectedYield=Number(profile&&profile.expected_yield||variety&&variety.expected_yield)||0;
  const yieldUnit=profile&&profile.yield_unit||variety&&variety.yield_unit||row.unit||"";
  const basis=String(profile&&profile.yield_basis||variety&&variety.yield_basis||"").toLowerCase();
  const requiredSaleable=Math.max(0,Number(row.additional_production_required)||0);
  const lossRate=Number(rates.loss_allowance_rate!==undefined?rates.loss_allowance_rate:
    rates.expected_loss_rate!==undefined?rates.expected_loss_rate:
    rates.loss_rejection_rate!==undefined?rates.loss_rejection_rate:0);
  const lossPercent=Number(rates.expected_loss_percent||0);
  const loss=Math.min(0.95,Math.max(0,lossRate>1?lossRate/100:lossRate,lossPercent/100));
  const gross=loss<1?requiredSaleable/(1-loss):requiredSaleable;
  const areaUnit=profile&&profile.yield_area_unit||variety&&variety.yield_area_unit||"";
  let area=null,plants=null,seedlings=null,seeds=null,plantingMaterial=null,seedUnit="",compost=null,compostUnit="";
  const spacingDensity=erpProductionSpacingDensity_(variety);
  if(basis==="per_plant"&&selectedYield>0)plants=Math.ceil(gross/selectedYield);
  if(basis==="per_area"&&selectedYield>0&&areaUnit){
    area=gross/selectedYield;
    if(spacingDensity){
      const squareMetres=erpProductionAreaIn_(area,areaUnit,"sqm");
      if(squareMetres!==null)plants=Math.ceil(squareMetres*spacingDensity/10000);
    }
  }
  const propagation=String(profile&&profile.propagation_method||variety&&variety.propagation_method||"").toLowerCase();
  const germinationRaw=profile&&profile.germination_rate!==""&&profile.germination_rate!==undefined?Number(profile.germination_rate):1;
  const survivalRaw=profile&&profile.survival_rate!==""&&profile.survival_rate!==undefined?Number(profile.survival_rate):1;
  const germination=Math.min(1,Math.max(0,germinationRaw>1?germinationRaw/100:germinationRaw));
  const survival=Math.min(1,Math.max(0,survivalRaw>1?survivalRaw/100:survivalRaw));
  if(plants!==null){
    const fieldEstablishment=Math.max(0,survival);
    if(/direct|seed/.test(propagation)&&!/nursery|transplant/.test(propagation)){
      seeds=Math.ceil(plants/Math.max(0.000001,germination*fieldEstablishment));seedUnit="seeds";
    }else if(/nursery|transplant/.test(propagation)){
      seedlings=Math.ceil(plants/Math.max(0.000001,fieldEstablishment));
      seeds=Math.ceil(seedlings/Math.max(0.000001,germination));seedUnit="seeds";
    }else{
      plantingMaterial=Math.ceil(plants/Math.max(0.000001,fieldEstablishment));
    }
  }
  const seedRate=rates.seed_rate_per_area;
  if(seedRate&&typeof seedRate==="object"&&area!==null&&
      (!seedRate.area_unit||String(seedRate.area_unit)===String(areaUnit))){
    seeds=area*Number(seedRate.quantity||0);seedUnit=seedRate.unit||"";
  }
  const compostPlant=rates.compost_rate_per_plant;
  const compostArea=rates.compost_rate_per_area;
  if(compostPlant&&typeof compostPlant==="object"&&plants!==null){
    compost=plants*Number(compostPlant.quantity||0);compostUnit=compostPlant.unit||"";
  }else if(compostArea&&typeof compostArea==="object"&&area!==null&&
      (!compostArea.area_unit||String(compostArea.area_unit)===String(areaUnit))){
    compost=area*Number(compostArea.quantity||0);compostUnit=compostArea.unit||"";
  }
  const duration=Number(profile&&profile.duration_days||variety&&variety.duration_days||0);
  const nurseryDays=Number(profile&&profile.nursery_days||0);
  const targetDate=startDate||"";
  const plantingDate=duration>0&&targetDate?erpAddDays_(targetDate,-duration):"";
  const nurseryRoute=/nursery|transplant/.test(String(profile&&profile.propagation_method||variety&&variety.propagation_method||"").toLowerCase());
  const nurseryDate=nurseryRoute&&plantingDate&&nurseryDays>0?erpAddDays_(plantingDate,-nurseryDays):"";
  const seedLead=Number(rates.seed_lead_days||0),compostLead=Number(rates.compost_lead_days||0);
  return {
    gross_production_required:gross,loss_allowance_rate:loss,
    required_plant_count:plants,required_seedling_quantity:seedlings,
    required_seed_quantity:seeds,seed_quantity_unit:seedUnit,
    required_planting_material_quantity:plantingMaterial,
    required_cultivation_area:area,area_unit:areaUnit,
    required_compost_quantity:compost,compost_unit:compostUnit,
    target_first_harvest_date:targetDate,
    latest_safe_planting_date:plantingDate,
    nursery_sow_date:nurseryDate,
    seed_procurement_by:plantingDate&&seedLead>0?erpAddDays_(plantingDate,-seedLead):"",
    compost_ready_by:plantingDate&&compostLead>0?erpAddDays_(plantingDate,-compostLead):"",
    planning_assumption_status:requiredSaleable===0?"no_additional_production":
      (selectedYield>0?"calculated":"yield_assumption_missing"),
    planning_assumption_note:!selectedYield?"Configure a variety/crop yield assumption before calculating new planting requirements.":
      (basis==="per_area"&&!areaUnit?"Set yield_area_unit to calculate cultivation area.":"")
  };
}

/**
 * Net demand-to-production plan:
 * - order balances and forecast demand remain distinct;
 * - demand can be segmented by crop, variety, grade and unit;
 * - saleable lot stock is reduced by explicit order reservations;
 * - only established or explicitly approved crop cycles count as committed future supply;
 * - actual harvest-to-date is deducted from cycle yield;
 * - no unrecorded unit conversions or hidden yield assumptions are made.
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
  const demandRows=farmRows(erpRead_("DemandRecords",{limit:1000}).rows)
    .filter(d=>!["cancelled","inactive","deleted","rejected","draft"].includes(String(d.status||"").toLowerCase()));
  const orders=farmRows(erpRead_("SalesOrders",{limit:1000}).rows)
    .filter(o=>!["draft","cancelled","closed","rejected"].includes(String(o.status||"").toLowerCase()));
  const orderById={},orderRefs={};
  orders.forEach(o=>{
    orderById[o.sales_order_id]=o;
    [o.sales_order_id,o.external_order_id,o.order_number].filter(Boolean).forEach(ref=>orderRefs[String(ref)]=o);
  });
  const orderLines=erpRead_("SalesOrderLines",{limit:1000}).rows.filter(l=>orderById[l.sales_order_id]);
  orderLines.forEach(line=>{
    const order=orderById[line.sales_order_id];
    if(!erpInPeriod_(order.required_date||order.order_date,start,end))return;
    const product=productsById[line.product_id]||{},cropId=product.crop_id||"";
    if(!cropId)return;
    const crop=cropsById[cropId]||{},varietyId=line.variety_id||product.variety_id||"";
    const variety=varietiesById[varietyId]||{};
    const remaining=Math.max(0,(Number(line.quantity_ordered)||0)-(Number(line.quantity_fulfilled)||0));
    if(!remaining)return;
    const b=erpBucket_(buckets,cropId,line.unit||product.base_unit,crop.crop_name,varietyId,variety.variety_name||"",line.grade||product.grade||"");
    b.confirmed_demand+=remaining;
    b.supply_basis.push("Confirmed sales order "+(order.order_number||order.sales_order_id));
  });
  demandRows.forEach(d=>{
    const inWindow=d.required_date?erpInPeriod_(d.required_date,start,end):
      erpProductionDateOverlap_(d.period_start||d.required_date,d.period_end||d.period_start,start,end);
    if(!inWindow)return;
    const type=String(d.demand_type||"forecast").toLowerCase();
    const product=productsById[d.product_id]||{};
    const cropId=d.crop_id||product.crop_id||"",crop=cropsById[cropId]||{};
    const varietyId=d.variety_id||product.variety_id||"",variety=varietiesById[varietyId]||{};
    if(d.source_reference&&orderRefs[String(d.source_reference)]&&
      ["confirmed","standing","confirmed_order"].includes(type))return;
    const b=erpBucket_(buckets,cropId,d.unit||product.base_unit,crop.crop_name,varietyId,variety.variety_name||"",product.grade||"");
    const q=Number(d.quantity)||0;
    if(!(q>0))return;
    if(["confirmed","standing","confirmed_order"].includes(type))b.confirmed_demand+=q;
    else b.forecast_demand+=q;
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
    if(["inactive","quarantine","wastage","expired","rejected"].includes(String(lot.status||"").toLowerCase())||
      ["quarantine","wastage","rejected","expired"].includes(String(lot.quality_status||"").toLowerCase()))return;
    if(lot.expiry_date&&erpDateKey_(lot.expiry_date)<start)return;
    const available=Math.max(0,(Number(lot.quantity_available)||0)-(reservedByLot[lot.produce_lot_id]||0));
    if(!available)return;
    const crop=cropsById[lot.crop_id]||{},variety=varietiesById[lot.variety_id]||{};
    erpBucket_(buckets,lot.crop_id,lot.unit,crop.crop_name,lot.variety_id,variety.variety_name||"",lot.grade||"").available_stock+=available;
  });

  const today=erpDateKey_(new Date());
  const cycles=farmRows(erpRead_("CropCycles",{limit:1000}).rows).filter(c=>
    erpProductionDateOverlap_(c.expected_harvest_start||c.expected_end_date,
      c.expected_harvest_end||c.expected_harvest_start||c.expected_end_date,start,end)&&
    erpProductionEligibleCycle_(c,today));
  const sessionById={},sessions=erpRead_("HarvestSessions",{limit:1000}).rows;
  sessions.forEach(h=>sessionById[h.harvest_id]=h);
  const harvestedByCycle={};
  erpRead_("HarvestLines",{limit:1000}).rows.forEach(line=>{
    const session=sessionById[line.harvest_id];
    if(!session||!session.crop_cycle_id||["draft","cancelled","void"].includes(String(session.status||"").toLowerCase()))return;
    const key=session.crop_cycle_id+"|"+String(line.unit||"").toLowerCase();
    harvestedByCycle[key]=(harvestedByCycle[key]||0)+(Number(line.quantity)||0);
  });
  cycles.forEach(c=>{
    const crop=cropsById[c.crop_id]||{},variety=varietiesById[c.variety_id]||{};
    const profile=erpProductionProfile_(profiles,c.crop_id,c.variety_id,c.production_system);
    const rate=erpProductionRate_(profile,variety,c);
    if(!rate||!(Number(rate.total)>0))return;
    const harvested=harvestedByCycle[c.crop_cycle_id+"|"+String(rate.unit||"").toLowerCase()]||0;
    const remaining=Math.max(0,Number(rate.total)-harvested);
    if(!remaining)return;
    const b=erpBucket_(buckets,c.crop_id,rate.unit,crop.crop_name,c.variety_id,variety.variety_name||"","");
    b.projected_crop_supply+=remaining;
    b.supply_basis.push("Crop cycle "+(c.cycle_name||c.crop_cycle_id)+" ("+rate.source+")");
    const confidence=String(c.forecast_confidence||profile&&profile.assumption_basis||"reference_assumption").toLowerCase();
    if(/actual|historical|farm_history/.test(confidence))b.confidence="high";
    else if(/manager|approved/.test(confidence)&&b.confidence!=="high")b.confidence="medium";
    else if(b.confidence==="unknown")b.confidence="low";
    if(c.forecast_yield&&c.forecast_basis)b.supply_basis.push("Cycle forecast basis: "+c.forecast_basis);
  });

  const rows=Object.keys(buckets).map(k=>{
    const b=buckets[k],supply=b.available_stock+b.projected_crop_supply;
    const row=Object.assign({},b,{
      total_demand:b.confirmed_demand+b.forecast_demand,
      total_projected_supply:supply,
      gap_confirmed:b.confirmed_demand-supply,
      gap_including_forecast:b.confirmed_demand+b.forecast_demand-supply
    });
    row.additional_production_required=Math.max(0,row.gap_including_forecast);
    const variety=varietiesById[row.variety_id]||{};
    const profile=erpProductionProfile_(profiles,row.crop_id,row.variety_id,"");
    const req=erpProductionRequirements_(row,profile,variety,start);
    Object.assign(row,req);
    row.supply_basis=[...new Set(row.supply_basis)];
    return row;
  }).sort((a,b)=>b.additional_production_required-a.additional_production_required);
  return {ok:true,farmId:farmId||"",period:{start:start,end:end},rows:rows,
    methodology:"Confirmed order balances and forecast demand are separated and grouped by crop, variety, grade and unit. Explicit lot reservations are deducted from saleable stock. Only established or explicitly approved crop cycles contribute future supply; recorded harvest is deducted from cycle yield. New planting requirements use versioned crop/variety assumptions and only calculate where the required basis and units are configured.",
    limitations:["Crop-cycle supply is included when its expected harvest date or explicit harvest window overlaps the selected period; the total remaining cycle forecast is shown for that window, not spread across weeks.","Area conversions are limited to recognised units (acre, hectare, cent, square foot and square metre); other unit combinations are not inferred.","Seed and compost quantities are calculated only where crop-profile resource_rates_json includes the documented keys: loss_allowance_rate, seed_rate_per_area, compost_rate_per_plant, compost_rate_per_area, seed_lead_days and compost_lead_days.","Forecast demand periods that partially overlap the selected window are included as a whole; enter separate period records for accurate weekly planning."]};
}

/** Save an immutable forecast snapshot so each rolling revision can be compared. */
function erpCreateForecastVersion(farmId,startDate,endDate,requestKey){
  if(!farmId)throw new Error("Select a farm before saving a forecast version.");
  if(!requestKey)throw new Error("A unique forecast-version request key is required.");
  const result=erpCalculateProductionGap(farmId,startDate,endDate);
  const profiles=erpRead_("CropProfiles",{limit:1000}).rows.filter(p=>String(p.status||"active").toLowerCase()!=="inactive"&&
    (!p.farm_id||String(p.farm_id)===String(farmId)));
  const assumptions=profiles.map(p=>({
    crop_profile_id:p.crop_profile_id,crop_id:p.crop_id,variety_id:p.variety_id,
    production_system:p.production_system,propagation_method:p.propagation_method,
    expected_yield:p.expected_yield,yield_unit:p.yield_unit,yield_basis:p.yield_basis,
    yield_area_unit:p.yield_area_unit,germination_rate:p.germination_rate,survival_rate:p.survival_rate,
    duration_days:p.duration_days,nursery_days:p.nursery_days,resource_rates_json:p.resource_rates_json,
    assumption_basis:p.assumption_basis
  }));
  const previous=erpRead_("ForecastVersions",{limit:1000,farmId:farmId}).rows
    .filter(v=>String(v.period_start)===String(result.period.start)&&String(v.period_end)===String(result.period.end))
    .sort((a,b)=>String(b.version_date||"").localeCompare(String(a.version_date||"")));
  const coverage={
    demand_and_supply_lines:result.rows.length,
    rows_with_additional_production:result.rows.filter(r=>r.additional_production_required>0).length,
    rows_missing_yield_assumptions:result.rows.filter(r=>r.planning_assumption_status==="yield_assumption_missing").length,
    rows_with_low_confidence:result.rows.filter(r=>r.confidence==="low").length,
    rows_with_unknown_confidence:result.rows.filter(r=>r.confidence==="unknown").length,
    totals:result.rows.reduce((o,r)=>{
      o.confirmed_demand+=Number(r.confirmed_demand)||0;
      o.forecast_demand+=Number(r.forecast_demand)||0;
      o.available_stock+=Number(r.available_stock)||0;
      o.projected_crop_supply+=Number(r.projected_crop_supply)||0;
      o.additional_production_required+=Number(r.additional_production_required)||0;
      return o;
    },{confirmed_demand:0,forecast_demand:0,available_stock:0,projected_crop_supply:0,additional_production_required:0}),
    result_snapshot:result
  };
  const saved=erpSave("ForecastVersions",{
    farm_id:farmId,version_date:erpDateKey_(new Date()),period_start:result.period.start,
    period_end:result.period.end,assumptions_json:JSON.stringify(assumptions),
    coverage_json:JSON.stringify(coverage),confidence_label:
      coverage.rows_with_low_confidence?"low":coverage.rows_with_unknown_confidence?"unknown":"high",
    created_by:erpActor_()
  },requestKey);
  return {ok:true,forecastVersion:saved.record,duplicate:!!saved.duplicate,
    supersedesVersionId:previous.length?previous[0].forecast_version_id:""};
}

