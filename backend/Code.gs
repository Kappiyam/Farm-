/**
 * Farm Management API — foundation
 * Deploy as a Web App after adding the script to a Google Apps Script project.
 * This initial endpoint is a connectivity check only; no farm data is read or written.
 */

const APP_VERSION = "0.1.0";
const APP_SERVICE = "farm-management-api";

function doGet() {
  return jsonResponse_({
    ok: true,
    service: APP_SERVICE,
    version: APP_VERSION,
    status: "ready",
    timestamp: new Date().toISOString()
  });
}

function doPost(event) {
  try {
    const payload = parseRequest_(event);
    const action = String(payload.action || "");

    if (action === "health") {
      return jsonResponse_({
        ok: true,
        service: APP_SERVICE,
        version: APP_VERSION,
        status: "ready",
        timestamp: new Date().toISOString()
      });
    }

    return jsonResponse_({
      ok: false,
      error: "Unsupported action",
      code: "NOT_FOUND"
    });
  } catch (error) {
    console.error(error);
    return jsonResponse_({
      ok: false,
      error: "Invalid request",
      code: "BAD_REQUEST"
    });
  }
}

function parseRequest_(event) {
  if (!event || !event.postData || !event.postData.contents) {
    throw new Error("Request body is missing");
  }
  return JSON.parse(event.postData.contents);
}

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}