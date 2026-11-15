const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const backendDir = path.join(root, "backend");
const backendFiles = fs.readdirSync(backendDir).filter(f => f.endsWith(".gs")).sort();
const sources = Object.fromEntries(backendFiles.map(name => [name, fs.readFileSync(path.join(backendDir, name), "utf8")]));
const backend = backendFiles.map(name => sources[name]).join("\n\n");
const app = fs.readFileSync(path.join(backendDir, "App.html"), "utf8");
const errors = [];
function check(ok, message) { if (!ok) errors.push(message); }
function argsCount(source) {
  if (!source.trim()) return 0;
  let count=1, depth=0, quote="", escaped=false;
  for (const ch of source) {
    if (quote) { if (escaped) escaped=false; else if (ch==="\\") escaped=true; else if (ch===quote) quote=""; continue; }
    if (ch==="'" || ch==='"' || ch==="`") { quote=ch; continue; }
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch==="," && depth===0) count++;
  }
  return count;
}
function findCalls(source) {
  const calls=[], re=/\\bcall\\([\\s\\n]*["']([A-Za-z_$][\\w$]*)["'](\\s*,)?/g;
  let m;
  while ((m=re.exec(source))) {
    if (!m[2]) { calls.push({name:m[1],args:0}); continue; }
    let depth=1, quote="", escaped=false, end=re.lastIndex;
    for (;end<source.length;end++) {
      const ch=source[end];
      if (quote) { if (escaped) escaped=false; else if (ch==="\\\\") escaped=true; else if (ch===quote) quote=""; continue; }
      if (ch==="'" || ch==='"' || ch==="`") { quote=ch; continue; }
      if (ch==="(") depth++;
      else if (ch===")" && --depth===0) break;
    }
    calls.push({name:m[1],args:argsCount(source.slice(re.lastIndex,end))});
  }
  return calls;
}
function getFunctionParameters(source, name) {
  const matches=[...source.matchAll(new RegExp("function\\\\s+"+name+"\\\\s*\\\\(([^)]*)\\)","g"))];
  if (matches.length!==1) return null;
  return argsCount(matches[0][1]);
}
try { new vm.Script(backend, {filename:"backend/*.gs"}); }
catch (e) { errors.push("Combined Apps Script project syntax: "+e.message); }
const declarations=[...backend.matchAll(/^\\s*function\\s+([A-Za-z_$][\\w$]*)\\s*\\(/gm)].map(m=>m[1]);
const declarationCounts=declarations.reduce((a,n)=>(a[n]=(a[n]||0)+1,a),{});
for (const [name,count] of Object.entries(declarationCounts)) check(count===1,"Duplicate Apps Script global function: "+name);
const declared=new Set(declarations);
const scriptMatches=[...app.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)];
check(scriptMatches.length>0,"App.html has no inline application script.");
scriptMatches.forEach((m,i)=>{try{new vm.Script(m[1],{filename:"App.html script "+(i+1)});}catch(e){errors.push("App.html script syntax: "+e.message);}});
const calls=findCalls(app);
const called=new Set(calls.map(c=>c.name));
for(const name of called) check(declared.has(name),"Frontend calls missing backend function: "+name);
const mutationArguments={
  erpSave:3,erpArchive:4,erpPostLedger:3,erpIssueInventoryLot:6,
  erpReceiveProcurement:3,erpFinalizeHarvest:3,erpFulfilSalesOrder:5,
  erpCreateInvoiceFromOrder:3,erpRecordCustomerPayment:3,erpAssignTask:3,
  erpRecordTaskExecution:3,erpUpdateTaskStatus:4,erpGenerateCropTasks:2,
  erpCreateTaskFromObservation:5,erpCreateTaskFromCalendarEvent:5,
  erpCancelCalendarOccurrence:4,erpUpdateCalendarEvent:6
};
for(const [name,count] of Object.entries(mutationArguments)){
  const sites=calls.filter(c=>c.name===name);
  check(sites.length>0,"Expected frontend mutation is not called: "+name);
  for(const site of sites)check(site.args===count,name+" call sends "+site.args+" arguments; expected "+count+".");
  check(getFunctionParameters(backend,name)===count,name+" backend signature must accept "+count+" arguments.");
}
for(const call of calls){
  const params=getFunctionParameters(backend,call.name);
  if(params!==null)check(call.args<=params,"Frontend call to "+call.name+" supplies too many arguments ("+call.args+" > "+params+").");
}
const service=sources["Services.gs"]||"";
const schemaMatch=service.match(/const ERP_TABLES = Object\\.freeze\\(\\{([\\s\\S]*?)\\n\\}\\);/);
check(!!schemaMatch,"Canonical ERP_TABLES declaration is missing from Services.gs.");
const schemaTables=new Set(schemaMatch?[...schemaMatch[1].matchAll(/^\\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map(m=>m[1]):[]);
check(schemaTables.size>=70,"Expected at least 70 canonical tables; found "+schemaTables.size+".");
const tableGroupMatch=app.match(/const tableGroups\\s*=\\s*\\{([\\s\\S]*?)\\n \\};/);
check(!!tableGroupMatch,"Frontend table group configuration is missing.");
const uiTables=new Set(tableGroupMatch?[...tableGroupMatch[1].matchAll(/\\["[^"]+","([A-Za-z][A-Za-z0-9]*)"\\]/g)].map(m=>m[1]):[]);
for(const table of uiTables)check(schemaTables.has(table,"Frontend table missing from canonical schema: "+table);
const fieldMatch=app.match(/const fieldTables\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);/);
const fieldTables=fieldMatch?[...fieldMatch[1].matchAll(/"([A-Za-z][A-Za-z0-9]*)"/g)].map(m=>m[1]):[];
for(const table of fieldTables)check(schemaTables.has(table),"Field editor references missing table: "+table);
const lookupMatch=app.match(/const lookupMap\\s*=\\s*\\{([\\s\\S]*?)\\};/);
const lookupPairs=lookupMatch?[...lookupMatch[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\\s*:\\s*"([A-Za-z][A-Za-z0-9]*)"/g)]:[];
const schemaFields=new Set(schemaMatch?[...schemaMatch[1].matchAll(/"([^"]+)"/g)].flatMap(m=>m[1].split("|")):[]);
for(const m of lookupPairs){
  check(schemaTables.has(m[2]),"Lookup field "+m[1]+" references missing table "+m[2]+".");
  check(schemaFields.has(m[1]),"Lookup field does not exist in canonical schema: "+m[1]+".");
}
const manifest=JSON.parse(fs.readFileSync(path.join(backendDir,"appsscript.json"),"utf8"));
check(manifest.runtimeVersion==="V8","Apps Script V8 runtime must be enabled.");
check(manifest.webapp&&manifest.webapp.executeAs==="USER_DEPLOYING","Web app must execute as deploying user.");
check(manifest.webapp&&manifest.webapp.access==="MYSELF","Do not expose the app before server-side user and farm authorisation is implemented.");
check(declared.has("erpPreviewSchemaMigration")&&declared.has("erpInstallSchema"),"Canonical schema preview/install entry points are missing.");
console.log("Apps Script files:",backendFiles.length);
console.log("Backend global functions:",declarations.length);
console.log("Frontend API calls:",calls.length);
console.log("Canonical tables:",schemaTables.size,"UI tables:",uiTables.size);
if(errors.length){console.error("\\nCONTRACT CHECK FAILED");errors.forEach(e=>console.error(" - "+e));process.exit(1);}
console.log("\\nCONTRACT CHECK PASSED");
