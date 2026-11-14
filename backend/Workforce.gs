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
    if(personId)erpGetRecord_("People",personId);
    if(userId)erpGetRecord_("Users",userId);
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
      erpUpdateTaskStatus(taskId,"assigned","Workers assigned");
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
  const results=[];
  executions.forEach((line,index)=>{
    const personId=String(line.person_id||"").trim();
    if(!personId)throw new Error("Each execution line must identify the participating worker.");
    erpGetRecord_("People",personId);
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
    const result=erpPostLedger("TaskExecution",record,key);
    results.push({executionId:result.id,duplicate:!!result.duplicate,personId:personId});
  });
  const currentStatus=String(task.status||"planned").toLowerCase();
  if(currentStatus==="planned")erpUpdateTaskStatus(taskId,"ready","Actual work started");
  if(["planned","ready","assigned","blocked"].includes(currentStatus))
    erpUpdateTaskStatus(taskId,"in_progress","Actual work recorded");
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
