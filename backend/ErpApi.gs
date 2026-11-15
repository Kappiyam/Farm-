/**
 * FarmERP API — bootstrap, validated CRUD, dashboard and workforce services.
 * All writes are serialised with a script lock and recorded in AuditLog.
 */
const ERP_LEDGER_TABLES = Object.freeze([
  "FinanceEntries","WageTransactions","Attendance","IrrigationOperations"
]);
const ERP_WORKFLOW_TABLES = Object.freeze([
  "HarvestLines","ProduceLotMovements","FulfilmentLines","InvoiceLines",
  "Payments","InventoryTransactions","StockLots","TaskExecution","IdempotencyKeys","AuditLog"
]);

function erpBootstrap() {
  var ss = erpDb_();
  var farms = erpReadTable_("Farms").filter(function(r){return erpActive_(r.status);});
  var orgs = erpReadTable_("Organizations").filter(function(r){return erpActive_(r.status);});
  var email = "";
  try { email = Session.getActiveUser().getEmail() || ""; } catch (e) {}
  return {
    ok:true, appVersion:APP_VERSION, schemaVersion:ERP_SCHEMA_VERSION,
    databaseName:ss.getName(), organization:orgs[0] || null,
    farms:farms, currentUser:{email:email,displayName:email ? email.split("@")[0] : "Owner"},
    languages:["en","ta","hi"], defaultLanguage:(farms[0]&&farms[0].default_language)||"ta",
    warnings:farms.length ? [] : ["No farm has been configured yet. Create the organisation and first farm in Settings and Farm Structure."]
  };
}

function erpList(tableName, options) {
  options = options || {};
  erpAssertTable_(tableName);
  var rows = erpReadTable_(tableName);
  var filter = options.filter || {};
  if (options.farmId && ERP_TABLE_DEFINITIONS[tableName].split("|").indexOf("farm_id") >= 0) {
    rows = rows.filter(function(r){return String(r.farm_id)===String(options.farmId);});
  }
  Object.keys(filter).forEach(function(k){
    if (ERP_TABLE_DEFINITIONS[tableName].split("|").indexOf(k)<0) throw new Error("Invalid filter field: "+k);
    rows = rows.filter(function(r){return String(r[k] == null ? "" : r[k])===String(filter[k]);});
  });
  if (options.search) {
    var q=String(options.search).toLowerCase();
    rows=rows.filter(function(r){return Object.keys(r).some(function(k){return String(r[k] == null ? "" : r[k]).toLowerCase().indexOf(q)>=0;});});
  }
  if (options.sortBy) {
    var sort=options.sortBy;
    if (ERP_TABLE_DEFINITIONS[tableName].split("|").indexOf(sort)<0) throw new Error("Invalid sort field.");
    var dir=String(options.sortDir||"desc").toLowerCase()==="asc"?1:-1;
    rows.sort(function(a,b){return String(a[sort]||"").localeCompare(String(b[sort]||""))*dir;});
  }
  var total=rows.length, offset=Math.max(0,Number(options.offset)||0);
  var limit=Math.min(1000,Math.max(1,Number(options.limit)||100));
  return {rows:rows.slice(offset,offset+limit),total:total,offset:offset,limit:limit};
}

function erpSave(tableName, record, requestKey) {
  record=record||{};
  erpAssertTable_(tableName);
  if (ERP_LEDGER_TABLES.indexOf(tableName)>=0 || ERP_WORKFLOW_TABLES.indexOf(tableName)>=0) {
    throw new Error("This table is append-only or workflow-managed. Use its dedicated posting workflow.");
  }
  var lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var priorResult=requestKey&&erpIdempotentResult_(requestKey,"erpSave");
    if (priorResult) return priorResult;
    var schema=ERP_TABLE_DEFINITIONS[tableName].split("|"), key=ERP_TABLE_KEYS[tableName];
    var clean={};
    Object.keys(record).forEach(function(k){
      if (schema.indexOf(k)<0) throw new Error("Unsupported field '"+k+"' for "+tableName+".");
      clean[k]=record[k];
    });
    var required=(erpGetSchema().required[tableName]||[]);
    required.forEach(function(k){if(clean[k]===undefined||String(clean[k]).trim()==="")throw new Error(k+" is required.");});
    var sheet=erpSheet_(tableName), values=sheet.getDataRange().getValues(), headers=values[0].map(String);
    var id=clean[key], rowIndex=-1;
    if (id) {
      for(var i=1;i<values.length;i++) if(String(values[i][headers.indexOf(key)])===String(id)){rowIndex=i+1;break;}
      if(rowIndex<0) throw new Error("Record not found in "+tableName+"; existing primary keys cannot be supplied for new records.");
    }
    var now=new Date().toISOString();
    if (!id) { id=Utilities.getUuid(); clean[key]=id; }
    if (schema.indexOf("created_at")>=0 && !clean.created_at) clean.created_at=now;
    if (schema.indexOf("updated_at")>=0) clean.updated_at=now;
    if (rowIndex>0) {
      var existing={};headers.forEach(function(h,i){existing[h]=values[rowIndex-1][i];});
      var merged=Object.assign(existing,clean);
      sheet.getRange(rowIndex,1,1,headers.length).setValues([headers.map(function(h){return merged[h]===undefined?"":merged[h];})]);
    } else {
      sheet.appendRow(headers.map(function(h){return clean[h]===undefined?"":clean[h];}));
    }
    erpAudit_(tableName,id,rowIndex>0?"update":"create",clean);
    var result={ok:true,table:tableName,key:id,record:clean};
    if(requestKey) erpStoreIdempotency_(requestKey,"erpSave",result);
    return result;
  } finally {lock.releaseLock();}
}

function erpArchiveUnlocked_(tableName, id, reason) {
  erpAssertTable_(tableName);
  if (ERP_ARCHIVABLE_TABLES.indexOf(tableName)<0) throw new Error("This record type cannot be archived.");
  var key=ERP_TABLE_KEYS[tableName], result=erpUpdateByKey_(tableName,key,id,{status:"inactive"});
  erpAudit_(tableName,id,"archive",{reason:reason||"Archived"});
  return {ok:true,key:id,status:"inactive",record:result};
}

function erpCsv(tableName) {
  erpAssertTable_(tableName);
  var rows=erpReadTable_(tableName), headers=ERP_TABLE_DEFINITIONS[tableName].split("|");
  var quote=function(v){var s=String(v==null?"":v);return '"'+s.replace(/"/g,'""')+'"';};
  return [headers.map(quote).join(",")].concat(rows.map(function(r){return headers.map(function(h){return quote(r[h]);}).join(",");})).join("\r\n");
}

function erpGetDashboard(farmId) {
  var tasks=erpReadTable_("Tasks"), observations=erpReadTable_("Observations"),
      cycles=erpReadTable_("CropCycles"), orders=erpReadTable_("SalesOrders"),
      items=erpReadTable_("InventoryItems"), lots=erpReadTable_("StockLots");
  function inFarm(r){return !farmId||String(r.farm_id)===String(farmId);}
  tasks=tasks.filter(inFarm);observations=observations.filter(inFarm);cycles=cycles.filter(inFarm);
  orders=orders.filter(inFarm);items=items.filter(inFarm);lots=lots.filter(inFarm);
  var today=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyy-MM-dd");
  var open=tasks.filter(function(t){return ["completed","cancelled"].indexOf(String(t.status).toLowerCase())<0;});
  var low=items.map(function(item){
    var balance=lots.filter(function(l){return String(l.item_id)===String(item.item_id)&&erpActive_(l.status);})
      .reduce(function(s,l){return s+(Number(l.quantity_available)||0);},0);
    return {item:item,balance:balance};
  }).filter(function(x){return Number(x.item.reorder_level)>0&&x.balance<=Number(x.item.reorder_level);});
  var due=open.filter(function(t){return String(t.due_at||"").slice(0,10)===today;});
  var overdue=open.filter(function(t){return t.due_at&&String(t.due_at).slice(0,10)<today;});
  var action=observations.filter(function(o){return ["action_required","monitor"].indexOf(String(o.quick_status||"").toLowerCase())>=0||["high","severe"].indexOf(String(o.severity||"").toLowerCase())>=0;});
  return {metrics:{openTasks:open.length,dueToday:due.length,overdue:overdue.length,actionRequired:action.length,
    activeCropCycles:cycles.filter(function(c){return erpActive_(c.status);}).length,
    openOrders:orders.filter(function(o){return ["fulfilled","cancelled","closed"].indexOf(String(o.status).toLowerCase())<0;}).length,
    lowStockItems:low.length},
    dueTasks:due.slice(0,10),overdueTasks:overdue.slice(0,10),actionObservations:action.slice(0,10),
    lowStock:low.slice(0,10),recentOrders:orders.slice(-10).reverse()};
}

function erpGetTaskBoard(farmId) {
  var tasks=erpReadTable_("Tasks"), assignments=erpReadTable_("TaskAssignments"), people=erpReadTable_("People");
  if(farmId)tasks=tasks.filter(function(t){return String(t.farm_id)===String(farmId);});
  var statuses=["planned","assigned","in_progress","blocked","completed"];
  var columns=statuses.map(function(status){
    var rows=tasks.filter(function(t){return String(t.status||"planned").toLowerCase()===status;}).map(function(t){
      var a=assignments.filter(function(x){return String(x.task_id)===String(t.task_id)&&erpActive_(x.status);});
      return Object.assign({},t,{assignees:a.map(function(x){var p=people.find(function(y){return String(y.person_id)===String(x.person_id);});return {person_id:x.person_id,name:p?p.display_name:""};})});
    });
    return {status:status,tasks:rows};
  });
  return {columns:columns,total:tasks.length,transitions:{
    planned:["assigned","cancelled"],assigned:["in_progress","blocked","planned"],in_progress:["blocked","completed","assigned"],
    blocked:["in_progress","cancelled"],completed:[]
  }};
}

function erpUpdateTaskStatusUnlocked_(taskId,status,reason) {
  var allowed=["planned","assigned","in_progress","blocked","completed","deferred","cancelled"];
  if(allowed.indexOf(status)<0)throw new Error("Unsupported task status.");
  var task=erpFindByKey_("Tasks","task_id",taskId);if(!task)throw new Error("Task not found.");
  var transitions={planned:["assigned","cancelled"],assigned:["in_progress","blocked","planned","cancelled"],in_progress:["blocked","completed","assigned"],blocked:["in_progress","cancelled"],completed:[],deferred:["planned","assigned","cancelled"],cancelled:[]};
  var current=String(task.status||"planned").toLowerCase();
  if(current===String(status).toLowerCase())return {ok:true,status:current,task:task,unchanged:true};
  if(!transitions[current]||transitions[current].indexOf(String(status).toLowerCase())<0)throw new Error("Invalid task status transition: "+current+" → "+status+".");
  var result=erpUpdateByKey_("Tasks","task_id",taskId,{status:status,updated_at:new Date().toISOString()});
  erpAppend_("TaskStatusHistory",{farm_id:task.farm_id,task_id:taskId,from_status:task.status||"",to_status:status,changed_at:new Date().toISOString(),reason:reason||"",changed_by:erpActor_()});
  erpAudit_("Tasks",taskId,"status_change",{from:task.status,to:status,reason:reason||""});
  return {ok:true,status:status,task:result};
}

function erpAssertPersonFarmMember_(personId,farmId) {
  var person=erpFindByKey_("People","person_id",personId);
  if(!person||!erpActive_(person.status))throw new Error("Worker is missing or inactive.");
  var member=erpReadTable_("TeamMembers").some(function(m){
    return String(m.person_id)===String(personId)&&String(m.farm_id)===String(farmId)&&erpActive_(m.status);
  });
  if(!member&&person.team_id){
    var team=erpFindByKey_("Teams","team_id",person.team_id);
    member=!!team&&String(team.farm_id)===String(farmId)&&erpActive_(team.status);
  }
  if(!member)throw new Error("Worker is not an active member of this farm.");
  return person;
}

function erpAssignTaskUnlocked_(taskId, assignments, requestKey) {
  var task=erpFindByKey_("Tasks","task_id",taskId);if(!task)throw new Error("Task not found.");
  var created=[],already=0;
  (assignments||[]).forEach(function(item){
    item=item||{};
    if(item.person_id){
      erpAssertPersonFarmMember_(item.person_id,task.farm_id);
      var exists=erpReadTable_("TaskAssignments").some(function(a){return String(a.task_id)===String(taskId)&&String(a.person_id)===String(item.person_id)&&erpActive_(a.status);});
      if(exists){already++;return;}
      created.push(erpAppend_("TaskAssignments",{farm_id:task.farm_id,task_id:taskId,person_id:item.person_id,assignment_role:item.assignment_role||"assignee",assigned_by:erpActor_(),assigned_at:new Date().toISOString(),status:"active"}));
    } else if(item.team_name) {
      var teams=erpReadTable_("Teams"),team=teams.find(function(t){return String(t.team_name)===String(item.team_name)&&String(t.farm_id)===String(task.farm_id)&&erpActive_(t.status);});
      if(!team)throw new Error("Active team not found for this farm: "+item.team_name);
      var existsTeam=erpReadTable_("TaskAssignments").some(function(a){return String(a.task_id)===String(taskId)&&String(a.team_id)===String(team.team_id)&&erpActive_(a.status);});
      if(existsTeam){already++;return;}
      created.push(erpAppend_("TaskAssignments",{farm_id:task.farm_id,task_id:taskId,team_id:team.team_id,assignment_role:item.assignment_role||"assignee",assigned_by:erpActor_(),assigned_at:new Date().toISOString(),status:"active"}));
    }
  });
  if(created.length&&task.status==="planned")erpUpdateByKey_("Tasks","task_id",taskId,{status:"assigned",updated_at:new Date().toISOString()});
  var result={ok:true,assignedCount:created.length,alreadyAssignedCount:already,assignments:created};
  return result;
}

function erpRecordTaskExecutionUnlocked_(taskId, entries, requestKey) {
  var task=erpFindByKey_("Tasks","task_id",taskId);if(!task)throw new Error("Task not found.");
  if(!entries||!entries.length)throw new Error("At least one execution entry is required.");
  var created=(entries||[]).map(function(e){
    e=e||{};
    if(!e.person_id)throw new Error("Each execution entry must identify the worker.");
    erpAssertPersonFarmMember_(e.person_id,task.farm_id);
    if(e.quantity!==undefined&&e.quantity!==""&&(!isFinite(Number(e.quantity))||Number(e.quantity)<0))throw new Error("Execution quantity cannot be negative.");
    if(e.duration_minutes!==undefined&&e.duration_minutes!==""&&(!isFinite(Number(e.duration_minutes))||Number(e.duration_minutes)<0))throw new Error("Execution duration cannot be negative.");
    if(e.contribution_percent!==undefined&&e.contribution_percent!==""&&(!isFinite(Number(e.contribution_percent))||Number(e.contribution_percent)<0||Number(e.contribution_percent)>100))throw new Error("Contribution must be between 0 and 100 percent.");
    return erpAppend_("TaskExecution",Object.assign({},e,{farm_id:task.farm_id,task_id:taskId,executed_at:e.executed_at||e.started_at||new Date().toISOString(),recorded_by:erpActor_()}));
  });
  if(created.length&&task.status!=="completed")erpUpdateByKey_("Tasks","task_id",taskId,{status:"in_progress",updated_at:new Date().toISOString()});
  var result={ok:true,recordedCount:created.length,executions:created};return result;
}

function erpPreviewCropTasks(cropCycleId) {
  var cycle=erpFindByKey_("CropCycles","crop_cycle_id",cropCycleId);if(!cycle)throw new Error("Crop cycle not found.");
  var templates=erpReadTable_("TaskTemplates").filter(function(t){return !t.crop_id||String(t.crop_id)===String(cycle.crop_id);});
  var start=cycle.planting_date||cycle.start_date;
  var existing=erpReadTable_("Tasks").filter(function(t){return String(t.crop_cycle_id)===String(cropCycleId);});
  var tasks=templates.map(function(t){
    var due=new Date(start);due.setDate(due.getDate()+(Number(t.offset_days)||0));
    var date=Utilities.formatDate(due,Session.getScriptTimeZone(),"yyyy-MM-dd");
    var duplicate=existing.some(function(x){return String(x.template_id)===String(t.template_id)&&String(x.due_at).slice(0,10)===date;});
    return {title:t.template_name,description:t.description,task_type:t.task_type,priority:t.default_priority||"normal",due_at:date,template_id:t.template_id,already_exists:duplicate};
  });
  return {ok:true,cycleName:cycle.cycle_name||cycleCycleName_(cycle),plannedCount:tasks.length,existingCount:tasks.filter(function(t){return t.already_exists;}).length,tasks:tasks,notice:"Review the proposed dates before generating planned tasks. Existing matching tasks are skipped."};
}

function erpGenerateCropTasksUnlocked_(cropCycleId) {
  var preview=erpPreviewCropTasks(cropCycleId),cycle=preview.cropCycle||erpFindByKey_("CropCycles","crop_cycle_id",cropCycleId);
  var created=[],skipped=0;
  preview.tasks.forEach(function(t){
    if(t.already_exists){skipped++;return;}
    created.push(erpAppend_("Tasks",{farm_id:cycle.farm_id,site_id:cycle.site_id,field_id:cycle.field_id,plot_id:cycle.plot_id,bed_id:cycle.bed_id,crop_cycle_id:cropCycleId,template_id:t.template_id,title:t.title,description:t.description,task_type:t.task_type,priority:t.priority,status:"planned",due_at:t.due_at,created_by:erpActor_()}));
  });
  return {ok:true,createdCount:created.length,skippedCount:skipped,created:created};
}

function cycleCycleName_(cycle){return cycle.crop_cycle_id||"Crop cycle";}

function erpCreateTaskFromObservation(observationId, title, dueAt, priority) {
  var o=erpFindByKey_("Observations","observation_id",observationId);if(!o)throw new Error("Observation not found.");
  return erpAppend_("Tasks",{farm_id:o.farm_id,site_id:o.site_id,field_id:o.field_id,plot_id:o.plot_id,bed_id:o.bed_id,crop_cycle_id:o.crop_cycle_id,title:title||"Follow up: "+o.category,description:o.description,task_type:"scouting_follow_up",priority:priority||(["high","severe"].indexOf(String(o.severity).toLowerCase())>=0?"high":"normal"),status:"planned",due_at:dueAt||"",created_by:erpActor_()});
}

function erpPostLedgerUnlocked_(tableName, record, requestKey) {
  if(ERP_LEDGER_TABLES.indexOf(tableName)<0||ERP_WORKFLOW_TABLES.indexOf(tableName)>=0)throw new Error("Unsupported or workflow-managed ledger table.");
  record=record||{};
  var schema=ERP_TABLE_DEFINITIONS[tableName].split("|");
  Object.keys(record).forEach(function(k){if(schema.indexOf(k)<0)throw new Error("Unsupported field '"+k+"' for "+tableName+".");});
  var required=erpGetSchema().required[tableName]||[];
  required.forEach(function(k){if(record[k]===undefined||String(record[k]).trim()==="")throw new Error(k+" is required.");});
  if(["FinanceEntries","WageTransactions"].indexOf(tableName)>=0&&(!(Number(record.amount)>0)||!isFinite(Number(record.amount))))throw new Error("Ledger amount must be a positive number.");
  if(tableName==="WageTransactions"&&(!record.person_id||!record.transaction_date))throw new Error("Wage transactions require a person and transaction date.");
  if(tableName==="Attendance"&&(!record.farm_id||!record.person_id||!record.attendance_date||!record.attendance_status))throw new Error("Attendance requires farm, person, date and status.");
  var saved=erpAppend_(tableName,record);
  var result={ok:true,record:saved};return result;
}

/* Internal data access and validation helpers. */
function erpDb_(){var ss=SpreadsheetApp.getActiveSpreadsheet();if(!ss)throw new Error("FarmERP database spreadsheet is unavailable.");return ss;}
function erpAssertTable_(name){if(!ERP_TABLE_DEFINITIONS[name])throw new Error("Unknown or unsupported table: "+name);}
function erpSheet_(name){erpAssertTable_(name);var s=erpDb_().getSheetByName(name);if(!s)throw new Error("Database table '"+name+"' is missing. Run the schema migration.");return s;}
function erpReadTable_(name){
  erpAssertTable_(name);var s=erpSheet_(name),values=s.getDataRange().getValues();if(values.length<2)return [];
  var headers=values[0].map(String);
  return values.slice(1).filter(function(row){return row.some(function(v){return v!==""&&v!==null;});}).map(function(row){
    var o={};headers.forEach(function(h,i){if(h)o[h]=row[i] instanceof Date?row[i].toISOString():row[i];});return o;
  });
}
function erpAppend_(name,record){
  erpAssertTable_(name);var s=erpSheet_(name),headers=s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0].filter(String);
  var schema=ERP_TABLE_DEFINITIONS[name].split("|"),clean={};
  Object.keys(record||{}).forEach(function(k){if(schema.indexOf(k)>=0)clean[k]=record[k];});
  var key=ERP_TABLE_KEYS[name];if(!clean[key])clean[key]=Utilities.getUuid();
  var now=new Date().toISOString();if(schema.indexOf("created_at")>=0&&!clean.created_at)clean.created_at=now;if(schema.indexOf("updated_at")>=0)clean.updated_at=now;
  s.appendRow(headers.map(function(h){return clean[h]===undefined?"":clean[h];}));
  if(typeof ERP_WORKFLOW_TRACKING!=="undefined"&&ERP_WORKFLOW_TRACKING)ERP_WORKFLOW_WRITE_COUNT++;
  erpAudit_(name,clean[key],"create",clean);return clean;
}
function erpFindByKey_(name,key,id){return erpReadTable_(name).find(function(r){return String(r[key])===String(id);})||null;}
function erpUpdateByKey_(name,key,id,patch){
  var s=erpSheet_(name),v=s.getDataRange().getValues(),h=v[0].map(String),idx=h.indexOf(key);
  if(idx<0)throw new Error("Primary key column is missing for "+name+".");
  for(var i=1;i<v.length;i++)if(String(v[i][idx])===String(id)){
    Object.keys(patch).forEach(function(k){var c=h.indexOf(k);if(c>=0)v[i][c]=patch[k];});
    s.getRange(i+1,1,1,h.length).setValues([v[i]]);
    if(typeof ERP_WORKFLOW_TRACKING!=="undefined"&&ERP_WORKFLOW_TRACKING)ERP_WORKFLOW_WRITE_COUNT++;
    return erpFindByKey_(name,key,id);
  }
  throw new Error("Record not found in "+name+".");
}
function erpAudit_(entity,id,action,summary){
  try{var schema=ERP_TABLE_DEFINITIONS.AuditLog.split("|"),row={entity_type:entity,entity_id:id,action:action,actor_user_id:erpActor_(),occurred_at:new Date().toISOString(),change_summary:JSON.stringify(summary||{})};erpAppendRaw_("AuditLog",row,schema);}catch(e){console.error("Audit write failed: "+e.message);}
}
function erpAppendRaw_(name,record,schema){
  var s=erpDb_().getSheetByName(name);if(!s)return;
  var h=s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0].filter(String);
  s.appendRow(h.map(function(k){return record[k]===undefined?"":record[k];}));
}
function erpActor_(){try{return Session.getActiveUser().getEmail()||"owner";}catch(e){return "owner";}}
function erpActive_(status){return ["inactive","archived","cancelled","void"].indexOf(String(status||"active").toLowerCase())<0;}
function erpIdempotentResult_(key,expectedAction){
  if(!key)return null;
  var rows=erpReadTable_("IdempotencyKeys"),r=rows.find(function(x){return String(x.request_key)===String(key);});
  if(!r)return null;
  if(expectedAction&&r.action&&String(r.action)!==String(expectedAction))throw new Error("Request key is already associated with a different workflow action.");
  var status=String(r.status||"").toLowerCase();
  if(status==="rejected")return null;
  if(status==="in_progress"||status==="failed")throw new Error("A previous attempt for this request key did not complete cleanly. Do not retry blindly; inspect the related records and reconcile the operation first.");
  if(status&&status!=="completed")throw new Error("Unknown idempotency state for this request. Manual reconciliation is required.");
  try{return JSON.parse(r.result_json);}catch(e){return {ok:true,replayed:true};}
}
function erpStoreIdempotency_(key,action,result){
  if(!key)return;
  var existing=erpReadTable_("IdempotencyKeys").find(function(x){return String(x.request_key)===String(key);});
  var patch={action:action,result_json:JSON.stringify(result),status:"completed",completed_at:new Date().toISOString(),error_message:""};
  if(existing)erpUpdateByKey_("IdempotencyKeys","idempotency_id",existing.idempotency_id,patch);
  else erpAppend_("IdempotencyKeys",Object.assign({request_key:key,started_at:new Date().toISOString(),created_at:new Date().toISOString()},patch));
}

function erpArchive(tableName,id,reason){return erpRunLockedWorkflow_("erpArchive",null,function(){return erpArchiveUnlocked_(tableName,id,reason);});}

function erpUpdateTaskStatus(taskId,status,reason){return erpRunLockedWorkflow_("erpUpdateTaskStatus",null,function(){return erpUpdateTaskStatusUnlocked_(taskId,status,reason);});}

function erpAssignTask(taskId,assignments,requestKey){return erpRunLockedWorkflow_("erpAssignTask",requestKey,function(){return erpAssignTaskUnlocked_(taskId,assignments,null);});}

function erpRecordTaskExecution(taskId,entries,requestKey){return erpRunLockedWorkflow_("erpRecordTaskExecution",requestKey,function(){return erpRecordTaskExecutionUnlocked_(taskId,entries,null);});}

function erpPostLedger(tableName,record,requestKey){return erpRunLockedWorkflow_("erpPostLedger",requestKey,function(){return erpPostLedgerUnlocked_(tableName,record,null);});}

function erpGenerateCropTasks(cropCycleId,requestKey){return erpRunLockedWorkflow_("erpGenerateCropTasks",requestKey,function(){return erpGenerateCropTasksUnlocked_(cropCycleId);});}
