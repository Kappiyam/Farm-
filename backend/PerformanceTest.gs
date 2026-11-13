/**
 * Farm Management — isolated performance benchmark
 * Version: 0.1.0
 *
 * Run runPerformanceBenchmark() manually from the Apps Script editor.
 * It writes ONLY to the dedicated PerfTestData tab using synthetic records.
 * It does not modify operational tables.
 *
 * Measures Spreadsheet service batch write/read/update timings.
 * It does not measure browser network latency or true concurrent users.
 */

const PERF_TEST_SHEET = "PerfTestData";
const PERF_TEST_HEADERS = [
  "test_id", "record_number", "record_type", "label",
  "quantity", "unit", "status", "created_at"
];
const PERF_TEST_SIZES = [100, 1000, 5000];

function runPerformanceBenchmark() {
  const totalStarted = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("No active spreadsheet. Run this from the bound database project.");

  const sheet = getOrCreatePerfTestSheet_(ss);
  const report = {
    benchmarkVersion: "0.1.0",
    appVersion: "0.2.1",
    spreadsheetName: ss.getName(),
    startedAt: new Date().toISOString(),
    tests: [],
    notes: [
      "Synthetic data only; operational tables are not read or changed.",
      "Timings cover Apps Script Spreadsheet service operations, not browser/network latency.",
      "Run at different times and compare repeated runs; Google service latency varies."
    ]
  };

  PERF_TEST_SIZES.forEach(function(size) {
    const rows = buildPerfRows_(size);
    const writeStarted = Date.now();
    sheet.getRange(2, 1, size, PERF_TEST_HEADERS.length).setValues(rows);
    SpreadsheetApp.flush();
    const writeMs = Date.now() - writeStarted;

    const readStarted = Date.now();
    const readRows = sheet.getRange(2, 1, size, PERF_TEST_HEADERS.length).getValues();
    const firstReadMs = Date.now() - readStarted;

    const repeatStarted = Date.now();
    const repeatedRows = sheet.getRange(2, 1, size, PERF_TEST_HEADERS.length).getValues();
    const repeatedReadMs = Date.now() - repeatStarted;

    const updateStarted = Date.now();
    const updateRange = sheet.getRange(2, 1, Math.min(size, 100), PERF_TEST_HEADERS.length);
    const updateRows = updateRange.getValues();
    updateRows.forEach(function(row, index) {
      row[6] = "updated";
      row[3] = "Updated synthetic record " + (index + 1);
    });
    updateRange.setValues(updateRows);
    SpreadsheetApp.flush();
    const updateMs = Date.now() - updateStarted;

    report.tests.push({
      records: size,
      writeBatchMs: writeMs,
      firstReadMs: firstReadMs,
      repeatedReadMs: repeatedReadMs,
      updateFirst100Ms: updateMs,
      readCountVerified: readRows.length,
      repeatedReadCountVerified: repeatedRows.length
    });
  });

  report.completedAt = new Date().toISOString();
  report.totalElapsedMs = Date.now() - totalStarted;
  report.result = "completed";
  console.log("PERFORMANCE_BENCHMARK " + JSON.stringify(report));
  return report;
}

function getOrCreatePerfTestSheet_(ss) {
  let sheet = ss.getSheetByName(PERF_TEST_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PERF_TEST_SHEET);
    sheet.getRange(1, 1, 1, PERF_TEST_HEADERS.length).setValues([PERF_TEST_HEADERS]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const actual = sheet.getRange(1, 1, 1, PERF_TEST_HEADERS.length).getDisplayValues()[0];
  const matches = PERF_TEST_HEADERS.every(function(header, index) {
    return actual[index] === header;
  });
  if (!matches) {
    throw new Error(
      "The existing " + PERF_TEST_SHEET + " tab has unexpected headers. " +
      "No data was changed. Expected: " + PERF_TEST_HEADERS.join(", ")
    );
  }

  // Clear only the dedicated synthetic test data area, preserving the header.
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, PERF_TEST_HEADERS.length).clearContent();
  }
  return sheet;
}

function buildPerfRows_(count) {
  const now = new Date().toISOString();
  const rows = [];
  for (let i = 1; i <= count; i++) {
    rows.push([
      "PERF-" + String(i).padStart(6, "0"),
      i,
      "synthetic",
      "Benchmark record " + i,
      (i % 97) + 1,
      "kg",
      "new",
      now
    ]);
  }
  return rows;
}
