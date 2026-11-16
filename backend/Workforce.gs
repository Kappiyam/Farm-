function erpAssertPersonFarmMember_(personId,farmId){
  erpGetRecord_("People",personId);
  const teams=erpRead_("Teams",{limit:1000,farmId:farmId}).rows;
  const teamIds=new Set(teams.filter(t=>!["inactive","archived"].includes(String(t.status||"").toLowerCase())).map(t=>String(t.team_id)));
  const today=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyy-MM-dd");
  const memberships=erpRead_("TeamMembers",{limit:1000}).rows.filter(m=>
    String(m.person_id)===String(personId)&&teamIds.has(String(m.team_id))&&
    !["inactive","cancelled","removed"].includes(String(m.status||"active").toLowerCase())&&
    (!m.valid_from||String(m.valid_from).slice(0,10)<=today)&&
    (!m.valid_to||String(m.valid_to).slice(0,10)>=today));
  if(!memberships.length)throw new Error("The selected worker is not an active member of a team in this farm.");
}
function erpAssertUserFarmMember_(userId,farmId){
  erpGetRecord_("Users",userId);
  const memberships=erpRead_("FarmMemberships",{limit:1000,farmId:farmId}).rows.filter(m=>
    String(m.user_id)===String(userId)&&!["inactive","revoked","cancelled"].includes(String(m.status||"active").toLowerCase()));
  if(!memberships.length)throw new Error("The selected user does not have an active membership in this farm.");
}
/**
 * Workforce/task execution services.
 * Planned tasks, assignments, attendance and measured execution remain distinct.
 */
function erpAssignTask(taskId,assignments,requestReference){
  if(!requestReference)throw new Error("A stable assignment request reference is required.");
  if(!Array.isArray(assignments)||!assignments.length)throw new Error("At least one worker or team assignment is required.");
  const task=erpGetRecord_("Tasks",taskId);
  if(["completed","cancelled"].includes(String(task.status||"").toLowerCase()))
    throw new Error("A completed or cancelled task cannot receive new assignments.");
  const saved=[],skipped=[];
  assignments.forEach((assignment,index)=>{
    const personId=String(assignment.person_id||"").trim();
    const userId=String(assignment.user_id||"").trim();
    const teamName=String(assignment.team_name||"").trim();
    if(!personId&&!userId&&!teamName)throw new Error("Each assignment must identify a person, user or team.");
    if(personId)erpAssertPersonFarmMember_(personId,task.farm_id);
    if(userId)erpAssertUserFarmMember_(userId,task.farm_id);
    if(teamName){
      const teams=erpRead_("Teams",{limit:1000,farmId:task.farm_id}).rows;
      if(!teams.some(t=>String(t.team_name).toLowerCase()===teamName.toLowerCase()))
        throw new Error("The selected team is not registered under this farm: "+teamName);
    }
    const matchFilter={task_id:taskId};
    if(personId)matchFilter.person_id=personId;
    else if(userId)matchFilter.user_id=userId;
    else matchFilter.team_name=teamName;
    const current=erpFindOne_("TaskAssignments",matchFilter);
    if(current&& !["cancelled","inactive","removed"].includes(String(current.status||"").toLowerCase())){
      skipped.push(current);
      return;
    }
    const data={
      task_id:taskId,person_id:personId,user_id:userId,team_name:teamName,
      assignment_role:assignment.assignment_role||"assignee",
      assigned_by:erpActor_(),assigned_at:new Date(),status:"active"
    };
    if(current)data.assignment_id=current.assignment_id;
    const idem=requestReference+":"+String(index)+":"+(personId||userId||teamName);
    const result=erpSave("TaskAssignments",data,idem);
    saved.push(result.record);
  });
  if(saved.length){
    const taskNow=erpGetRecord_("Tasks",taskId);
    if(["planned","ready"].includes(String(taskNow.status||"").toLowerCase()))
      erpUpdateTaskStatus(taskId,"assigned","Workers assigned",requestReference+":status");
  }
  return {ok:true,taskId:taskId,assignedCount:saved.length,alreadyAssignedCount:skipped.length,
    assignments:saved,skipped:skipped};
}

function erpRemoveTaskAssignment(assignmentId,reason){
  if(!String(reason||"").trim())throw new Error("A reason is required to remove a task assignment.");
  return erpWithLock_(()=>{
    const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("TaskAssignments");
    const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
    const idCol=headers.indexOf("assignment_id")+1;
    if(!idCol)throw new Error("Assignment key is missing.");
    const ids=sh.getLastRow()>=2?sh.getRange(2,idCol,sh.getLastRow()-1,1).getDisplayValues().flat():[];
    const index=ids.indexOf(String(assignmentId));if(index<0)throw new Error("Assignment not found.");
    const row=index+2,old=sh.getRange(row,1,1,headers.length).getValues()[0],before=erpObject_(headers,old);
    const statusCol=headers.indexOf("status")+1;
    sh.getRange(row,statusCol).setValue("cancelled");
    erpAudit_("TaskAssignments",assignmentId,"cancel",{status:before.status},{status:"cancelled",reason:reason,actor:erpActor_()});
    return {ok:true,assignmentId:assignmentId,status:"cancelled"};
  });
}

/** Capture measured work by participant without altering task plan or assignment history. */
function erpRecordTaskExecution(taskId,executions,batchReference){
  if(!batchReference)throw new Error("A stable execution batch reference is required.");
  if(!Array.isArray(executions)||!executions.length)throw new Error("At least one participant execution line is required.");
  const task=erpGetRecord_("Tasks",taskId);
  const priorExecutions=erpRead_("TaskExecution",{limit:1000,filter:{task_id:String(taskId)}}).rows;
  let contributionTotal=priorExecutions.reduce((sum,x)=>sum+(Number(x.contribution_percent)||0),0);
  executions.forEach((line,index)=>{
    const personId=String(line.person_id||"").trim();
    const key="task-execution:"+batchReference+":"+taskId+":"+index+":"+personId;
    const already=priorExecutions.some(x=>String(x.idempotency_key||"")===key);
    if(!already)contributionTotal+=Number(line.contribution_percent)||0;
  });
  if(contributionTotal>100.000001)throw new Error("Total worker contribution for this task cannot exceed 100 percent.");
  const results=[];
  executions.forEach((line,index)=>{
    const personId=String(line.person_id||"").trim();
    if(!personId)throw new Error("Each execution line must identify the participating worker.");
    erpAssertPersonFarmMember_(personId,task.farm_id);
    const started=line.started_at||new Date();
    const duration=Number(line.duration_minutes)||0;
    const quantity=line.quantity===""||line.quantity===null||line.quantity===undefined?"":Number(line.quantity);
    const area=line.area===""||line.area===null||line.area===undefined?"":Number(line.area);
    if(duration<0||!isFinite(duration))throw new Error("Execution duration must be zero or greater.");
    if(quantity!==""&&(!(quantity>=0)||!isFinite(quantity)))throw new Error("Execution quantity must be zero or greater.");
    if(area!==""&&(!(area>=0)||!isFinite(area)))throw new Error("Execution area must be zero or greater.");
    const record={
      task_id:taskId,person_id:personId,
      contribution_percent:line.contribution_percent===""?0:Number(line.contribution_percent)||0,
      started_at:started,completed_at:line.completed_at||"",
      duration_minutes:duration,quantity:quantity,quantity_unit:line.quantity_unit||"",
      area:area,area_unit:line.area_unit||"",evidence_file_id:line.evidence_file_id||"",
      notes:line.notes||"",exception_reason:line.exception_reason||"",
      review_status:"pending",recorded_by:erpActor_()
    };
    if(record.contribution_percent<0||record.contribution_percent>100)
      throw new Error("Contribution must be between 0 and 100 percent.");
    const key="task-execution:"+batchReference+":"+taskId+":"+index+":"+personId;
    const prior=priorExecutions.find(x=>String(x.idempotency_key||"")===key);
    if(prior){
      results.push({executionId:prior.execution_id,duplicate:true,personId:personId});
      return;
    }
    const result=erpPostLedger("TaskExecution",record,key);
    results.push({executionId:result.id,duplicate:!!result.duplicate,personId:personId});
  });
  const currentStatus=String(task.status||"planned").toLowerCase();
  if(currentStatus==="planned")erpUpdateTaskStatus(taskId,"ready","Actual work started",batchReference+":status-ready");
  if(["planned","ready","assigned","blocked"].includes(currentStatus))
    erpUpdateTaskStatus(taskId,"in_progress","Actual work recorded",batchReference+":status-progress");
  return {ok:true,taskId:taskId,recordedCount:results.length,results:results,
    note:"Execution records are measured actuals. Task completion status remains a separate review decision."};
}

/** Review state is workflow metadata; posted execution quantities are not edited. */
function erpReviewTaskExecution(executionId,reviewStatus,reason){
  const status=String(reviewStatus||"").toLowerCase();
  if(!["accepted","query","rejected"].includes(status))throw new Error("Review status must be accepted, query or rejected.");
  if(status!=="accepted"&&!String(reason||"").trim())throw new Error("A reason is required for queried or rejected execution.");
  return erpWithLock_(()=>{
    const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("TaskExecution");
    const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
    const idCol=headers.indexOf("execution_id")+1;
    const ids=sh.getLastRow()>=2?sh.getRange(2,idCol,sh.getLastRow()-1,1).getDisplayValues().flat():[];
    const index=ids.indexOf(String(executionId));if(index<0)throw new Error("Execution record not found.");
    const row=index+2,old=sh.getRange(row,1,1,headers.length).getValues()[0],before=erpObject_(headers,old);
    const statusCol=headers.indexOf("review_status")+1,reviewerCol=headers.indexOf("reviewed_by")+1,dateCol=headers.indexOf("reviewed_at")+1,reasonCol=headers.indexOf("exception_reason")+1;
    if(!statusCol||!reviewerCol||!dateCol)throw new Error("Execution review columns are unavailable.");
    sh.getRange(row,statusCol).setValue(status);
    sh.getRange(row,reviewerCol).setValue(erpActor_());
    sh.getRange(row,dateCol).setValue(new Date());
    if(reasonCol&&reason)sh.getRange(row,reasonCol).setValue(reason);
    erpAudit_("TaskExecution",executionId,"review",{review_status:before.review_status},{review_status:status,reason:reason||"",reviewed_by:erpActor_()});
    return {ok:true,executionId:executionId,reviewStatus:status};
  });
}



function erpDailyPlannerPriority_(value,severity){
  const raw=String(value||"").toLowerCase();
  if(["critical","urgent","emergency","safety"].includes(raw))return "critical";
  if(["high","important"].includes(raw)||String(severity||"").toLowerCase()==="high")return "high";
  if(["low","routine"].includes(raw))return "low";
  return "normal";
}
function erpDailyPlannerOpenStatus_(value){
  return !["cancelled","closed","completed","delivered","rejected","void","inactive","draft"].includes(String(value||"").toLowerCase());
}
/**
 * Consolidate existing scheduled work, unlinked scouting actions and order-driven
 * harvest requirements for one farm day. This endpoint is read-only: source
 * observations and orders are never silently converted into tasks or assignments.
 */
function erpGetDailyWorkPlanner(farmId,planDate){
  if(!farmId)throw new Error("Select a farm to open the daily work planner.");
  const date=erpDateKey_(planDate||new Date());
  if(!date)throw new Error("A valid work-plan date is required.");
  erpGetRecord_("Farms",farmId);
  const sameDay=value=>erpDateKey_(value)===date;
  const tasks=erpRead_("Tasks",{limit:5000,farmId:farmId}).rows.filter(t=>
    sameDay(t.due_at||t.planned_start)&&erpDailyPlannerOpenStatus_(t.status));
  const taskIds=new Set(tasks.map(t=>String(t.task_id)));
  const assignments=erpRead_("TaskAssignments",{limit:5000}).rows.filter(a=>
    taskIds.has(String(a.task_id))&&!["cancelled","inactive","removed"].includes(String(a.status||"").toLowerCase()));
  const people=erpRead_("People",{limit:2000}).rows.filter(p=>String(p.status||"active").toLowerCase()==="active");
  const peopleById={};people.forEach(p=>peopleById[p.person_id]=p);
  const assignmentsByTask={};assignments.forEach(a=>{
    if(!assignmentsByTask[a.task_id])assignmentsByTask[a.task_id]=[];
    const person=peopleById[a.person_id]||{};
    assignmentsByTask[a.task_id].push({person_id:a.person_id,name:person.display_name||a.person_id,
      team_name:a.team_name||"",assignment_role:a.assignment_role||""});
  });
  const executions=erpRead_("TaskExecution",{limit:10000}).rows.filter(e=>taskIds.has(String(e.task_id)));
  const executionByTask={};executions.forEach(e=>{
    if(!executionByTask[e.task_id])executionByTask[e.task_id]={records:0,minutes:0,quantity:0,participants:{}};
    const x=executionByTask[e.task_id];x.records++;x.minutes+=Number(e.duration_minutes)||0;
    x.quantity+=Number(e.quantity)||0;if(e.person_id)x.participants[e.person_id]=true;
  });
  const scheduledTasks=tasks.map(t=>{
    const actual=executionByTask[t.task_id]||{records:0,minutes:0,quantity:0,participants:{}};
    return Object.assign({},t,{
      priority:erpDailyPlannerPriority_(t.priority),
      assignees:assignmentsByTask[t.task_id]||[],
      actual:{records:actual.records,minutes:actual.minutes,quantity:actual.quantity,
        participants:Object.keys(actual.participants).map(id=>({person_id:id,name:(peopleById[id]||{}).display_name||id}))},
      planned_minutes:Number(t.estimated_duration_minutes)||0,
      assignment_state:(assignmentsByTask[t.task_id]||[]).length?"assigned":"unassigned"
    });
  }).sort((a,b)=>{
    const rank={critical:0,high:1,normal:2,low:3};
    return rank[a.priority]-rank[b.priority]||String(a.due_at||"").localeCompare(String(b.due_at||""));
  });

  const observations=erpRead_("Observations",{limit:5000,farmId:farmId}).rows.filter(o=>
    sameDay(o.observed_at)&&!o.resulting_task_id&&
    !["resolved","dismissed","closed"].includes(String(o.quick_status||"").toLowerCase()));
  const fieldsById={};erpRead_("Fields",{limit:2000,farmId:farmId}).rows.forEach(f=>fieldsById[f.field_id]=f);
  const plotsById={};erpRead_("Plots",{limit:5000,farmId:farmId}).rows.forEach(p=>plotsById[p.plot_id]=p);
  const cyclesById={};erpRead_("CropCycles",{limit:5000,farmId:farmId}).rows.forEach(c=>cyclesById[c.crop_cycle_id]=c);
  const cropsById={};erpRead_("Crops",{limit:2000}).rows.forEach(c=>cropsById[c.crop_id]=c);
  const scoutingActions=observations.map(o=>{
    const cycle=cyclesById[o.crop_cycle_id]||{},crop=cropsById[cycle.crop_id]||{};
    const plot=plotsById[o.plot_id]||{},field=fieldsById[o.field_id]||{};
    return {source_type:"scouting",source_reference:o.observation_id,observation_id:o.observation_id,
      observed_at:o.observed_at,category:o.category,severity:o.severity,quick_status:o.quick_status,
      description:o.description,priority:erpDailyPlannerPriority_(o.severity,o.severity),
      field_id:o.field_id,field_name:field.field_name||"",plot_id:o.plot_id,plot_name:plot.plot_name||"",
      crop_id:cycle.crop_id||"",crop_name:crop.crop_name||"",crop_cycle_id:o.crop_cycle_id||""};
  }).sort((a,b)=>{
    const rank={critical:0,high:1,normal:2,low:3};
    return rank[a.priority]-rank[b.priority];
  });

  const orders=erpRead_("SalesOrders",{limit:5000,farmId:farmId}).rows.filter(o=>erpDailyPlannerOpenStatus_(o.status));
  const orderById={};orders.forEach(o=>orderById[o.sales_order_id]=o);
  const lines=erpRead_("SalesOrderLines",{limit:10000}).rows.filter(l=>orderById[l.sales_order_id]);
  const productsById={};erpRead_("Products",{limit:3000}).rows.forEach(p=>productsById[p.product_id]=p);
  const varietiesById={};erpRead_("Varieties",{limit:3000}).rows.forEach(v=>varietiesById[v.variety_id]=v);
  const lots=erpRead_("ProduceLots",{limit:10000,farmId:farmId}).rows;
  const lotById={};lots.forEach(l=>lotById[l.produce_lot_id]=l);
  const reservationsByLot={},reservationsByLine={};
  lines.forEach(l=>{
    const reserved=Math.max(0,(Number(l.quantity_ordered)||0)-(Number(l.quantity_fulfilled)||0));
    if(l.produce_lot_id&&reserved>0){
      reservationsByLot[l.produce_lot_id]=(reservationsByLot[l.produce_lot_id]||0)+reserved;
      reservationsByLine[l.sales_line_id]=(reservationsByLine[l.sales_line_id]||0)+reserved;
    }
  });
  const stockPools={};
  lots.forEach(l=>{
    if(["inactive","quarantine","wastage","expired","rejected"].includes(String(l.status||"").toLowerCase())||
       ["quarantine","wastage","expired","rejected"].includes(String(l.quality_status||"").toLowerCase()))return;
    if(l.expiry_date&&erpDateKey_(l.expiry_date)<date)return;
    const available=Math.max(0,erpProduceLotBalance_(l.produce_lot_id)-(reservationsByLot[l.produce_lot_id]||0));
    const key=[l.crop_id||"",l.variety_id||"",l.grade||"",l.unit||""].join("|");
    stockPools[key]=(stockPools[key]||0)+available;
  });
  const orderLines=lines.filter(l=>sameDay(orderById[l.sales_order_id].required_date||orderById[l.sales_order_id].order_date))
    .sort((a,b)=>String(orderById[a.sales_order_id].required_date||orderById[a.sales_order_id].order_date)
      .localeCompare(String(orderById[b.sales_order_id].required_date||orderById[b.sales_order_id].order_date)));
  const harvestRequirements=orderLines.map(line=>{
    const order=orderById[line.sales_order_id],product=productsById[line.product_id]||{};
    const crop=cropsById[product.crop_id]||{},variety=varietiesById[product.variety_id]||{};
    const remaining=Math.max(0,(Number(line.quantity_ordered)||0)-(Number(line.quantity_fulfilled)||0));
    const directReserved=Math.min(remaining,reservationsByLine[line.sales_line_id]||0);
    const key=[product.crop_id||"",product.variety_id||"",line.grade||product.grade||"",line.unit||product.base_unit||""].join("|");
    const pool=Math.max(0,Number(stockPools[key])||0);
    const freeAllocation=Math.min(Math.max(0,remaining-directReserved),pool);
    stockPools[key]=Math.max(0,pool-freeAllocation);
    const stockCovered=directReserved+freeAllocation;
    return {source_type:"sales_order",source_reference:order.sales_order_id,source_line_id:line.sales_line_id,
      sales_order_id:order.sales_order_id,order_number:order.order_number||order.sales_order_id,
      customer_name:(erpGetCached_("Customers",order.customer_id)||{}).customer_name||"",
      required_date:order.required_date||order.order_date,product_id:line.product_id,
      product_name:product.product_name||"",crop_id:product.crop_id||"",crop_name:crop.crop_name||"",
      variety_id:product.variety_id||"",variety_name:variety.variety_name||"",grade:line.grade||product.grade||"",
      quantity_ordered:Number(line.quantity_ordered)||0,quantity_fulfilled:Number(line.quantity_fulfilled)||0,
      remaining_quantity:remaining,stock_reserved_for_order:directReserved,
      unallocated_stock_applied:freeAllocation,estimated_harvest_gap:Math.max(0,remaining-stockCovered),
      unit:line.unit||product.base_unit||"",priority:"high",
      linked_lot_id:line.produce_lot_id||"",review_required:false};
  }).filter(x=>x.remaining_quantity>0);

  const attendance=erpRead_("Attendance",{limit:5000,farmId:farmId}).rows.filter(a=>sameDay(a.work_date));
  const attendanceByPerson={};attendance.forEach(a=>attendanceByPerson[a.person_id]=a);
  const teamMembers=erpRead_("TeamMembers",{limit:5000}).rows;
  const teams=erpRead_("Teams",{limit:1000,farmId:farmId}).rows;
  const teamById={};teams.forEach(t=>teamById[t.team_id]=t);
  const teamsByPerson={};teamMembers.forEach(m=>{
    if(String(m.status||"active").toLowerCase()!=="active")return;
    if(m.valid_from&&erpDateKey_(m.valid_from)>date)return;
    if(m.valid_to&&erpDateKey_(m.valid_to)<date)return;
    const team=teamById[m.team_id];if(!team)return;
    (teamsByPerson[m.person_id]||(teamsByPerson[m.person_id]=[])).push(team.team_name);
  });
  const workerAvailability=people.map(p=>{
    const a=attendanceByPerson[p.person_id],status=a?String(a.attendance_status||"recorded").toLowerCase():"not_recorded";
    return {person_id:p.person_id,name:p.display_name,status:status,
      availability:/(absent|leave|off|holiday)/.test(status)?"unavailable":status==="not_recorded"?"unknown":"available",
      teams:teamsByPerson[p.person_id]||[],preferred_language:p.preferred_language||""};
  }).sort((a,b)=>a.name.localeCompare(b.name));
  const scheduledMinutes=scheduledTasks.reduce((sum,t)=>sum+t.planned_minutes,0);
  const assignedMinutes=scheduledTasks.reduce((sum,t)=>sum+(t.planned_minutes*(t.assignees.length||0)),0);
  const present=workerAvailability.filter(w=>w.availability==="available").length;
  const absent=workerAvailability.filter(w=>w.availability==="unavailable").length;
  const unrecorded=workerAvailability.filter(w=>w.availability==="unknown").length;
  return {ok:true,farmId:farmId,planDate:date,
    sources:{scheduled_tasks:scheduledTasks,scouting_actions:scoutingActions,order_harvest_requirements:harvestRequirements},
    workforce:{workers:workerAvailability,available_count:present,unavailable_count:absent,attendance_unrecorded_count:unrecorded},
    summary:{
      scheduled_tasks:scheduledTasks.length,unassigned_tasks:scheduledTasks.filter(t=>t.assignment_state==="unassigned").length,
      assigned_tasks:scheduledTasks.filter(t=>t.assignment_state==="assigned").length,
      scouting_actions:scoutingActions.length,order_lines:harvestRequirements.length,
      harvest_gap_quantity:harvestRequirements.reduce((sum,x)=>sum+x.estimated_harvest_gap,0),
      planned_minutes:scheduledMinutes,estimated_person_minutes:assignedMinutes,
      tasks_with_actuals:scheduledTasks.filter(t=>t.actual.records>0).length
    },
    notes:["Attendance without a record is unknown, not assumed available.",
      "Order harvest gap is calculated after order-specific lot reservations and shared unallocated saleable stock; no unit conversion is inferred.",
      "Observations and order requirements remain source records until a manager explicitly creates and allocates tasks."]};
}
