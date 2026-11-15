const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const backendFiles = ["Code.gs", "ErpSchema.gs", "ErpApi.gs", "ErpWorkflows.gs"];
const sources = backendFiles.map(name => fs.readFileSync(path.join(root, "backend", name), "utf8"));
const backend = sources.join("\n");
const app = fs.readFileSync(path.join(root, "backend", "App.html"), "utf8");
const errors = [];

for (const name of backendFiles) {
  const source = fs.readFileSync(path.join(root, "backend", name), "utf8");
  try { new Function(source); }
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
for (const name of called) if (!declared.has(name)) errors.push("Frontend calls missing backend function: " + name);

const schemaBlock = (fs.readFileSync(path.join(root, "backend", "ErpSchema.gs"), "utf8").match(/const ERP_TABLE_DEFINITIONS[\s\S]*?\n\}\);/) || [""])[0];
const schemaTables = new Set([...schemaBlock.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):/gm)].map(m => m[1]));
const tableGroupBlock = (app.match(/const tableGroups\s*=\s*\{([\s\S]*?)\n \};/) || ["",""])[1];
const uiTables = new Set([...tableGroupBlock.matchAll(/\["[^"]+","([A-Za-z][A-Za-z0-9]*)"\]/g)].map(m => m[1]));
for (const table of uiTables) if (!schemaTables.has(table)) errors.push("Frontend table missing from canonical schema: " + table);

const duplicates = [...backend.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]).filter((n,i,a)=>a.indexOf(n)!==i);
for (const name of new Set(duplicates)) errors.push("Duplicate backend function declaration: " + name);

console.log("Backend functions:", declared.size);
console.log("Frontend API calls:", called.size);
console.log("UI tables:", uiTables.size, "Canonical tables:", schemaTables.size);
if (errors.length) {
  console.error("\nCONTRACT CHECK FAILED");
  errors.forEach(e => console.error(" - " + e));
  process.exit(1);
}
console.log("\nCONTRACT CHECK PASSED");
