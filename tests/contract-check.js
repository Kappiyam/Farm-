const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const backendFiles = ["Code.gs", "ErpSchema.gs", "ErpApi.gs", "ErpWorkflows.gs"];
const sources = Object.fromEntries(backendFiles.map(name => [name, fs.readFileSync(path.join(root, "backend", name), "utf8")]));
const backend = Object.values(sources).join("\n");
const app = fs.readFileSync(path.join(root, "backend", "App.html"), "utf8");
const errors = [];

function check(condition, message) { if (!condition) errors.push(message); }
function bodyOf(source, name) {
  const start = source.search(new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{"));
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  let depth = 0, quote = "", escaped = false, line = false, block = false;
  for (let i = open; i < source.length; i++) {
    const c = source[i], n = source[i + 1];
    if (line) { if (c === "\n") line = false; continue; }
    if (block) { if (c === "*" && n === "/") { block = false; i++; } continue; }
    if (quote) { if (escaped) { escaped = false; continue; } if (c === "\\") { escaped = true; continue; } if (c === quote) quote = ""; continue; }
    if (c === "/" && n === "/") { line = true; i++; continue; }
    if (c === "/" && n === "*") { block = true; i++; continue; }
    if (c === "'" || c === '"' || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    if (c === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  return "";
}

for (const name of backendFiles) {
  try { new Function(sources[name]); }
  catch (error) { errors.push(name + " syntax: " + error.message); }
}
const scriptMatch = app.match(/<script>([\s\S]*?)<\/script>/i);
if (!scriptMatch) errors.push("App.html has no inline application script.");
else {
  try { new Function(scriptMatch[1]); }
  catch (error) { errors.push("App.html script syntax: " + error.message); }
}

const declared = new Set([...backend.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
const called = new Set([...app.matchAll(/\bcall\(["']([A-Za-z_$][\w$]*)["']/g)].map(m => m[1]));
for (const name of called) check(declared.has(name), "Frontend calls missing backend function: " + name);

function countTopLevelArgs(source) {
  if (!source.trim()) return 0;
  let count = 1, depth = 0, quote = "", escaped = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (escaped) { escaped = false; continue; } if (c === "\\") { escaped = true; continue; } if (c === quote) quote = ""; continue; }
    if (c === "'" || c === '"' || c === "`") { quote = c; continue; }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) count++;
  }
  return count;
}
function callSites(source) {
  const sites = [];
  const re = /\bcall\(["']([A-Za-z_$][\w$]*)["'](\s*,)?/g;
  let match;
  while ((match = re.exec(source))) {
    let depth = 1, quote = "", escaped = false, end = re.lastIndex;
    if (!match[2]) { sites.push({name:match[1],args:0}); continue; }
    for (; end < source.length; end++) {
      const c = source[end];
      if (quote) { if (escaped) { escaped = false; continue; } if (c === "\\") { escaped = true; continue; } if (c === quote) quote = ""; continue; }
      if (c === "'" || c === '"' || c === "`") { quote = c; continue; }
      if (c === "(") depth++;
      if (c === ")" && --depth === 0) break;
    }
    sites.push({name:match[1],args:countTopLevelArgs(source.slice(re.lastIndex,end))});
  }
  return sites;
}
const parameterCounts = {};
for (const match of backend.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g)) {
  parameterCounts[match[1]] = countTopLevelArgs(match[2]);
}
for (const site of callSites(app)) {
  check(site.args <= parameterCounts[site.name],
    "Frontend passes " + site.args + " arguments to " + site.name + " but backend declares " + parameterCounts[site.name] + ".");
}


const schemaBlock = (sources["ErpSchema.gs"].match(/const ERP_TABLE_DEFINITIONS[\s\S]*?\n\}\);/) || [""])[0];
const schemaTables = new Set([...schemaBlock.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map(m => m[1]));
const tableGroupBlock = (app.match(/const tableGroups\s*=\s*\{([\s\S]*?)\n \};/) || ["",""])[1];
const uiTables = new Set([...tableGroupBlock.matchAll(/\["[^"]+","([A-Za-z][A-Za-z0-9]*)"\]/g)].map(m => m[1]));
for (const table of uiTables) check(schemaTables.has(table), "Frontend table missing from canonical schema: " + table);

const lookupMapBlock = (app.match(/const lookupMap\\s*=\\s*\\{([\\s\\S]*?)\\};/) || ["",""])[1];
const lookupTables = new Set([...lookupMapBlock.matchAll(/:\\s*"([A-Za-z][A-Za-z0-9]*)"/g)].map(m => m[1]));
for (const table of lookupTables) check(schemaTables.has(table), "Lookup references missing canonical table: " + table);

const fieldTableBlock = (app.match(/const fieldTables\s*=\s*new Set\(\[([\s\S]*?)\]\);/) || ["",""])[1];
const fieldTables = new Set([...fieldTableBlock.matchAll(/"([A-Za-z][A-Za-z0-9]*)"/g)].map(m => m[1]));
for (const table of fieldTables) check(schemaTables.has(table), "Field editor references missing canonical table: " + table);

const schemaFields = new Set([...schemaBlock.matchAll(/"([^"]+)"/g)].flatMap(m => m[1].split("|")));
const lookupPairs = [...lookupMapBlock.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\\s*:\\s*"([A-Za-z][A-Za-z0-9]*)"/g)].map(m => ({field:m[1],table:m[2]}));
for (const pair of lookupPairs) check(schemaFields.has(pair.field), "Lookup map field is absent from canonical schema: " + pair.field);
const lookupKeys = lookupPairs.map(x=>x.field);
for (const key of new Set(lookupKeys.filter((x,i)=>lookupKeys.indexOf(x)!==i))) errors.push("Duplicate lookup map key: " + key);




const duplicates = [...backend.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]).filter((n,i,a)=>a.indexOf(n)!==i);
for (const name of new Set(duplicates)) errors.push("Duplicate backend function declaration: " + name);

const manifest = JSON.parse(fs.readFileSync(path.join(root, "backend", "appsscript.json"), "utf8"));
check(manifest.webapp && manifest.webapp.executeAs === "USER_DEPLOYING" && manifest.webapp.access === "MYSELF",
  "Deployment must remain owner-only until user identity and farm-level permissions are implemented.");
check(declared.has("erpInstallSchema") && !declared.has("setupDatabase") && !declared.has("upgradeMultiFarmSchema"),
  "Current setup must use the canonical additive FarmERP schema migration, not legacy setup routines.");


for (const file of ["ErpApi.gs", "ErpWorkflows.gs"]) {
  check(backend.includes("function erpRunLockedWorkflow_"), "Missing shared workflow lock helper.");
}
const workflowLocks = [
  ["ErpWorkflows.gs","erpIssueInventoryLot"],
  ["ErpWorkflows.gs","erpReceiveProcurement"],
  ["ErpWorkflows.gs","erpFinalizeHarvest"],
  ["ErpWorkflows.gs","erpFulfilSalesOrder"],
  ["ErpWorkflows.gs","erpCreateInvoiceFromOrder"],
  ["ErpWorkflows.gs","erpRecordCustomerPayment"],
  ["ErpApi.gs","erpArchive"],
  ["ErpApi.gs","erpUpdateTaskStatus"],
  ["ErpApi.gs","erpAssignTask"],
  ["ErpApi.gs","erpRecordTaskExecution"],
  ["ErpApi.gs","erpPostLedger"],
  ["ErpApi.gs","erpGenerateCropTasks"],
  ["ErpWorkflows.gs","erpCancelCalendarOccurrence"],
  ["ErpWorkflows.gs","erpUpdateCalendarEvent"]
];
for (const [file,name] of workflowLocks) {
  const body = bodyOf(sources[file], name);
  check(body.includes("erpRunLockedWorkflow_"), name + " must execute under the shared script lock.");
}
const lockBody = bodyOf(sources["ErpWorkflows.gs"], "erpRunLockedWorkflow_");
check(lockBody.includes("waitLock(30000)") && lockBody.includes("finally") && lockBody.includes("releaseLock()"),
  "Workflow lock must wait with a timeout and always release in finally.");
const procurement = bodyOf(sources["ErpWorkflows.gs"], "erpReceiveProcurement");
check(procurement.includes("requested[") && procurement.includes("outstanding"),
  "Procurement receipts must cumulatively validate repeated lines before writing.");
const fulfilment = bodyOf(sources["ErpWorkflows.gs"], "erpFulfilSalesOrder");
check(fulfilment.includes("byLine[") && fulfilment.includes("byLot["),
  "Sales fulfilment must aggregate quantities by order line and produce lot before writing.");
const taskStatus = bodyOf(sources["ErpApi.gs"], "erpUpdateTaskStatusUnlocked_");
check(taskStatus.includes("transitions") && taskStatus.includes("Invalid task status transition"),
  "Task status changes must validate the state transition.");

console.log("Backend functions:", declared.size);
console.log("Frontend API calls:", called.size);
console.log("UI tables:", uiTables.size, "Canonical tables:", schemaTables.size);
console.log("Critical workflow lock checks:", workflowLocks.length);
if (errors.length) {
  console.error("\nCONTRACT CHECK FAILED");
  errors.forEach(e => console.error(" - " + e));
  process.exit(1);
}
console.log("\nCONTRACT CHECK PASSED");
