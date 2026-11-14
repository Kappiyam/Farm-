import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const backendDir = path.join(root, "backend");
const gsFiles = fs.readdirSync(backendDir).filter(f => f.endsWith(".gs")).sort();
if (!gsFiles.includes("Services.gs")) throw new Error("Missing backend/Services.gs");
if (!gsFiles.includes("Code.gs")) throw new Error("Missing backend/Code.gs");

const combined = gsFiles.map(f => fs.readFileSync(path.join(backendDir, f), "utf8")).join("\n\n");
new vm.Script(combined, { filename: "backend/*.gs" });

const html = fs.readFileSync(path.join(backendDir, "App.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
if (!scripts.length) throw new Error("No application script found in backend/App.html");
scripts.forEach((match, i) => new vm.Script(match[1], { filename: `backend/App.html inline script ${i + 1}` }));

const staticJs = path.join(root, "assets", "app.js");
if (fs.existsSync(staticJs)) new vm.Script(fs.readFileSync(staticJs, "utf8"), { filename: "assets/app.js" });

const services = fs.readFileSync(path.join(backendDir, "Services.gs"), "utf8");
const tableBlock = services.match(/const ERP_TABLES = Object\.freeze\(({[\s\S]*?})\);/);
if (!tableBlock) throw new Error("ERP_TABLES schema declaration not found");
const names = [...tableBlock[1].matchAll(/^\s{2}([A-Za-z][A-Za-z0-9]*):\s*\[/gm)].map(m => m[1]);
if (names.length < 50) throw new Error(`Expected at least 50 standard domain tables, found ${names.length}`);
for (const required of ["Farms","Sites","Fields","Plots","CropCycles","Tasks","TaskExecution","InventoryTransactions","HarvestSessions","ProduceLots","SalesOrders","Invoices","Payments","FinanceEntries","Assets","CalendarEvents","AuditLog"]) {
  if (!names.includes(required)) throw new Error(`Required standard table missing: ${required}`);
}
const tableGroupsBlock = html.match(/const tableGroups\s*=\s*\{([\s\S]*?)\n \};/);
if (!tableGroupsBlock) throw new Error("Module table configuration not found in backend/App.html");
const uiTables = [...tableGroupsBlock[1].matchAll(/\["[^"]+","([A-Z][A-Za-z0-9]+)"\]/g)].map(m => m[1]);
for (const table of new Set(uiTables)) {
  if (!names.includes(table)) throw new Error(`UI refers to undefined table: ${table}`);
}
console.log(`FarmERP validation passed: ${gsFiles.length} Apps Script files parsed; ${scripts.length} UI script parsed; ${names.length} domain tables declared.`);
