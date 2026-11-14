/**
 * Standard recurring calendar service.
 * Calendar events remain separate from tasks. No occurrence creates assignments.
 * Past occurrences are snapshotted before series edits so historical content is preserved.
 */
function erpCalDate_(value){
  if(value instanceof Date)return new Date(value.getTime());
  if(!value)throw new Error("Calendar date/time is required.");
  const raw=String(value);
  if(/[zZ]$|[+-]\d\d:\d\d$/.test(raw)){
    const d=new Date(raw);if(!isNaN(d.getTime()))return d;
  }
  const tz=Session.getScriptTimeZone();
  let parsed=null;
  try{parsed=Utilities.parseDate(raw,tz,"yyyy-MM-dd'T'HH:mm:ss");}catch(e){}
  if(!parsed){try{parsed=Utilities.parseDate(raw,tz,"yyyy-MM-dd'T'HH:mm");}catch(e){}}
  if(!parsed){try{parsed=Utilities.parseDate(raw,tz,"yyyy-MM-dd");}catch(e){}}
  if(!parsed||isNaN(parsed.getTime()))throw new Error("Invalid calendar date/time: "+raw);
  return parsed;
}
function erpCalKey_(value){
  return Utilities.formatDate(erpCalDate_(value),Session.getScriptTimeZone(),"yyyy-MM-dd'T'HH:mm:ss");
}
function erpCalDateOnly_(value){
  return Utilities.formatDate(erpCalDate_(value),Session.getScriptTimeZone(),"yyyy-MM-dd");
}
function erpCalAddDays_(date,days){
  const d=new Date(date.getTime());d.setDate(d.getDate()+Number(days||0));return d;
}
function erpCalWithDate_(dateValue,datePart){
  const original=erpCalDate_(dateValue),day=erpCalDate_(datePart);
  day.setHours(original.getHours(),original.getMinutes(),original.getSeconds(),original.getMilliseconds());
  return day;
}
function erpCalStep_(base,type,interval,index){
  const d=new Date(base.getTime()),n=Math.max(1,Number(interval)||1)*index;
  if(type==="daily"||type==="custom")d.setDate(d.getDate()+n);
  else if(type==="weekly")d.setDate(d.getDate()+(7*n));
  else if(type==="monthly"){
    const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);
    const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));
  }else if(type==="yearly"){
    const month=d.getMonth(),day=d.getDate();d.setDate(1);d.setFullYear(d.getFullYear()+n);d.setMonth(month);
    const last=new Date(d.getFullYear(),month+1,0).getDate();d.setDate(Math.min(day,last));
  }
  return d;
}
function erpCalOccurrencesForMaster_(event,startValue,endValue){
  const start=erpCalDate_(event.start_at),end=erpCalDate_(endValue);
  const rangeStart=erpCalDate_(startValue);
  const type=String(event.recurrence_type||"none").toLowerCase();
  const recurring=["daily","weekly","monthly","yearly","custom"].includes(type);
  const interval=Math.max(1,Number(event.recurrence_interval)||1);
  const countLimit=Number(event.occurrence_limit)||0;
  const recurrenceEnd=event.recurrence_end?erpCalDate_(event.recurrence_end):null;
  const duration=event.end_at?erpCalDate_(event.end_at).getTime()-start.getTime():0;
  const rows=[];
  function push(date,index){
    const dateKey=erpCalKey_(date);
    const endDate=duration>0?new Date(date.getTime()+duration):null;
    rows.push({
      event_id:event.event_id,series_id:event.series_id||event.event_id,
      occurrence_start:dateKey,occurrence_end:endDate?erpCalKey_(endDate):"",
      title:event.title,event_type:event.event_type||"event",farm_id:event.farm_id,
      site_id:event.site_id||"",field_id:event.field_id||"",description:event.description||"",
      all_day:event.all_day===true||String(event.all_day).toLowerCase()==="true",
      status:event.status||"active",is_recurring:recurring,occurrence_number:index+1,
      recurrence_type:type,recurrence_interval:interval
    });
  }
  if(!recurring){
    if(start>=rangeStart&&start<=end)push(start,0);
    return rows;
  }
  let index=0;
  // Iterate from the series origin to preserve recurrence numbering and interval semantics.
  let current=new Date(start.getTime());
  while(current<=end&&index<10000){
    if(recurrenceEnd&&current>recurrenceEnd)break;
    if(countLimit&&index>=countLimit)break;
    if(current>=rangeStart)push(current,index);
    index++;
    current=erpCalStep_(start,type,interval,index);
  }
  return rows;
}
function erpCalOverrideKey_(eventId,occurrenceStart){
  return String(eventId)+"|"+erpCalKey_(occurrenceStart);
}
function erpCalApplyOverrides_(occurrences,overrides){
  const map={};
  overrides.forEach(o=>map[erpCalOverrideKey_(o.event_id,o.occurrence_start)]=o);
  return occurrences.map(item=>{
    const override=map[erpCalOverrideKey_(item.event_id,item.occurrence_start)];
    if(!override)return item;
    if(String(override.action).toLowerCase()==="cancel")return null;
    let values={};
    try{values=JSON.parse(override.overrides_json||"{}");}catch(e){}
    return Object.assign({},item,values,{override_id:override.override_id,has_override:true});
  }).filter(Boolean);
}

/** Return calendar instances for day/week/month/year/agenda clients. */
function erpGetCalendarRange(farmId,startDate,endDate){
  const start=erpCalDate_(startDate),end=erpCalDate_(endDate);
  if(end<start)throw new Error("Calendar end date must not be before start date.");
  const masters=erpRead_("CalendarEvents",{limit:5000}).rows
    .filter(e=>!farmId||String(e.farm_id)===String(farmId));
  const snapshots=erpRead_("CalendarEventOccurrences",{limit:10000}).rows;
  const overrides=erpRead_("CalendarEventOverrides",{limit:10000}).rows;
  const snapshotKeys={};
  const all=[];
  snapshots.forEach(o=>{
    const d=erpCalDate_(o.occurrence_start);
    if(d<start||d>end)return;
    snapshotKeys[erpCalOverrideKey_(o.event_id,o.occurrence_start)]=true;
    let snapshot={};
    try{snapshot=JSON.parse(o.snapshot_json||"{}");}catch(e){}
    all.push(Object.assign({},snapshot,o,{is_snapshot:true}));
  });
  masters.forEach(event=>{
    const instances=erpCalOccurrencesForMaster_(event,start,end);
    instances.forEach(x=>{
      const key=erpCalOverrideKey_(x.event_id,x.occurrence_start);
      if(!snapshotKeys[key])all.push(x);
    });
  });
  const effective=erpCalApplyOverrides_(all,overrides);
  effective.sort((a,b)=>String(a.occurrence_start).localeCompare(String(b.occurrence_start)));
  return {ok:true,start:erpCalDateOnly_(start),end:erpCalDateOnly_(end),events:effective,
    eventCount:effective.length,taskSeparation:"Calendar events do not create or assign operational tasks automatically."};
}

/** Snapshot all past occurrences before a series record is edited or split. */
function erpMaterialisePastCalendarOccurrences_(event){
  const start=erpCalDate_(event.start_at),now=new Date();
  if(start>now)return {created:0};
  const instances=erpCalOccurrencesForMaster_(event,start,now);
  const existing=erpRead_("CalendarEventOccurrences",{limit:10000}).rows
    .filter(o=>String(o.event_id)===String(event.event_id));
  const seen={};existing.forEach(o=>seen[erpCalKey_(o.occurrence_start)]=true);
  const overrides=erpRead_("CalendarEventOverrides",{limit:10000}).rows
    .filter(o=>String(o.event_id)===String(event.event_id));
  const effective=erpCalApplyOverrides_(instances,overrides);
  let created=0;
  effective.forEach(instance=>{
    const key=erpCalKey_(instance.occurrence_start);
    if(seen[key])return;
    const id=Utilities.getUuid(),nowDate=new Date();
    const snapshot={
      event_id:event.event_id,series_id:event.series_id||event.event_id,
      occurrence_start:instance.occurrence_start,occurrence_end:instance.occurrence_end,
      title:instance.title,event_type:instance.event_type,site_id:instance.site_id,
      field_id:instance.field_id,description:instance.description,all_day:instance.all_day,
      status:instance.status||"active"
    };
    const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CalendarEventOccurrences");
    const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
    const row={occurrence_id:id,event_id:event.event_id,series_id:event.series_id||event.event_id,
      occurrence_start:instance.occurrence_start,occurrence_end:instance.occurrence_end,
      title:instance.title,event_type:instance.event_type,site_id:instance.site_id,field_id:instance.field_id,
      description:instance.description,all_day:instance.all_day,status:instance.status||"active",
      snapshot_json:JSON.stringify(snapshot),created_at:nowDate};
    sh.appendRow(headers.map(h=>Object.prototype.hasOwnProperty.call(row,h)?row[h]:""));
    seen[key]=true;created++;
  });
  return {created:created};
}

function erpUpdateCalendarEventRow_(eventId,changes,actionReason){
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName("CalendarEvents");
  const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0];
  const idCol=headers.indexOf("event_id")+1;
  const ids=sh.getRange(2,idCol,Math.max(0,sh.getLastRow()-1),1).getDisplayValues().flat();
  const index=ids.indexOf(String(eventId));
  if(index<0)throw new Error("Calendar event not found.");
  const row=index+2,oldValues=sh.getRange(row,1,1,headers.length).getValues()[0],before=erpObject_(headers,oldValues);
  const forbidden=["event_id","created_at"];
  Object.keys(changes).forEach(k=>{
    if(headers.indexOf(k)<0)throw new Error("Unsupported calendar field: "+k);
    if(forbidden.includes(k))throw new Error("This calendar field cannot be changed.");
  });
  const next=Object.assign({},before,changes);
  if(!next.title||!next.start_at)throw new Error("Calendar title and start date/time are required.");
  if(next.end_at&&erpCalDate_(next.end_at)<erpCalDate_(next.start_at))throw new Error("Event end must not be before its start.");
  const values=headers.map((h,i)=>Object.prototype.hasOwnProperty.call(changes,h)?erpCoerce_(changes[h]):(h==="updated_at"?new Date():oldValues[i]));
  sh.getRange(row,1,1,headers.length).setValues([values]);
  erpAudit_("CalendarEvents",eventId,"series_update",before,Object.assign({},changes,{reason:actionReason||""}));
  return erpObject_(headers,values);
}

/**
 * Edit recurring event scope:
 * - single: save an occurrence override only;
 * - future: snapshot past events, cap the old series, and create a continuation;
 * - series: snapshot past events, then update the future pattern.
 */
function erpUpdateCalendarEvent(eventId,scope,occurrenceStart,changes,reason){
  scope=String(scope||"").toLowerCase();
  if(!["single","future","series"].includes(scope))throw new Error("Choose single, future or series edit scope.");
  if(!changes||typeof changes!=="object"||Array.isArray(changes))throw new Error("Calendar changes are required.");
  const event=erpGetRecord_("CalendarEvents",eventId);
  const occurrence=occurrenceStart?erpCalDate_(occurrenceStart):erpCalDate_(event.start_at);
  const recurring=["daily","weekly","monthly","yearly","custom"].includes(String(event.recurrence_type||"").toLowerCase());
  const allowedSingle=["title","event_type","start_at","end_at","site_id","field_id","description","all_day","status"];
  if(scope==="single"){
    Object.keys(changes).forEach(k=>{if(allowedSingle.indexOf(k)<0)throw new Error("Single-occurrence edits cannot change "+k+".");});
    const prior=erpFindOne_("CalendarEventOverrides",{event_id:eventId,occurrence_start:erpCalKey_(occurrence)});
    const merged=Object.assign({},prior&&prior.overrides_json?JSON.parse(prior.overrides_json):{},changes);
    if(prior){
      const saved=erpSave("CalendarEventOverrides",{override_id:prior.override_id,
        event_id:eventId,occurrence_start:erpCalKey_(occurrence),action:"update",
        overrides_json:JSON.stringify(merged),reason:reason||"",updated_at:new Date()});
      return {ok:true,scope:scope,override:saved.record};
    }
    const saved=erpSave("CalendarEventOverrides",{event_id:eventId,occurrence_start:erpCalKey_(occurrence),
      action:"update",overrides_json:JSON.stringify(merged),reason:reason||"",created_by:erpActor_()});
    return {ok:true,scope:scope,override:saved.record};
  }
  return erpWithLock_(()=>{
    erpMaterialisePastCalendarOccurrences_(event);
    if(scope==="series"||!recurring){
      const updated=erpUpdateCalendarEventRow_(eventId,changes,reason);
      return {ok:true,scope:scope,event:updated,pastOccurrencesPreserved:true};
    }
    if(occurrence<erpCalDate_(event.start_at))throw new Error("Selected occurrence is before the series start.");
    const previousEnd=erpCalAddDays_(occurrence,-1);
    erpUpdateCalendarEventRow_(eventId,{recurrence_end:erpCalDateOnly_(previousEnd)}, "Series split before future edit");
    const newStart=erpCalWithDate_(event.start_at,occurrence);
    const duration=event.end_at?erpCalDate_(event.end_at).getTime()-erpCalDate_(event.start_at).getTime():0;
    const continuation=Object.assign({},event,changes,{
      event_id:undefined,
      start_at:newStart,
      end_at:duration?new Date(newStart.getTime()+duration):(changes.end_at||""),
      recurrence_end:changes.recurrence_end||event.recurrence_end||"",
      series_id:event.series_id||event.event_id,
      created_by:erpActor_()
    });
    delete continuation.event_id;
    delete continuation.created_at;
    delete continuation.updated_at;
    const saved=erpSave("CalendarEvents",continuation);
    return {ok:true,scope:scope,originalEventId:eventId,continuation:saved.record,
      pastOccurrencesPreserved:true};
  });
}

function erpCancelCalendarOccurrence(eventId,occurrenceStart,reason){
  return erpUpdateCalendarEvent(eventId,"single",occurrenceStart,{status:"cancelled"},reason||"Cancelled occurrence");
}

/** Explicitly create a task from an event occurrence; assignment remains separate. */
function erpCreateTaskFromCalendarEvent(eventId,occurrenceStart,title,dueAt){
  const event=erpGetRecord_("CalendarEvents",eventId);
  if(!title)throw new Error("Task title is required.");
  const occurrence=occurrenceStart?erpCalDate_(occurrenceStart):erpCalDate_(event.start_at);
  const task=erpSave("Tasks",{
    farm_id:event.farm_id,site_id:event.site_id,field_id:event.field_id,event_id:eventId,
    title:title,description:"Created explicitly from calendar event: "+event.title,
    task_type:"event_follow_up",priority:"normal",status:"ready",
    planned_start:erpCalDateOnly_(occurrence),due_at:dueAt||erpCalDateOnly_(occurrence),
    created_by:erpActor_()
  });
  return {ok:true,task:task.record,eventId:eventId,assignmentCreated:false};
}

/** Event participant/attendance list remains independent from task assignments. */
function erpSetEventParticipant(eventId,personId,attendanceStatus){
  const existing=erpFindOne_("EventParticipants",{event_id:eventId,person_id:personId});
  const data={event_id:eventId,person_id:personId,attendance_status:attendanceStatus||"invited"};
  if(existing)data.participant_id=existing.participant_id;
  return erpSave("EventParticipants",data);
}
