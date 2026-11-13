(() => {
  "use strict";
  const config = window.FARM_APP_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  const content = $("#app-content");
  const appName = config.appName || "Farm Management";
  $("#brand-name").textContent = appName;
  document.title = appName;

  const views = {
    overview: { title: "Overview", render: renderOverview },
    "farm-setup": { title: "Farm setup", render: renderFarmSetup }
  };

  function renderOverview() {
    return `
      <div class="welcome"><h2>Build your farm workspace</h2>
        <p>This is the clean application foundation. Farm-specific records, workflows and terminology will be introduced through configuration rather than embedded in the application.</p>
      </div>
      <div class="grid">
        <article class="panel">
          <div class="panel-head"><h3>Backend connection</h3><span class="tag">Foundation</span></div>
          <p>Check whether the Google Apps Script web app is deployed and reachable.</p>
          <div id="api-status" class="connection"><i class="connection-dot"></i><span>Connection not checked</span></div>
          <div style="margin-top:14px"><button id="check-api" class="button">Check connection</button></div>
        </article>
        <article class="panel">
          <div class="panel-head"><h3>Implementation sequence</h3><span class="tag">Planned</span></div>
          <div class="steps">
            <div class="step"><b class="step-no">1</b><div><strong>Application foundation</strong><span>Shell, configuration, API and access control</span></div></div>
            <div class="step"><b class="step-no">2</b><div><strong>Farm structure</strong><span>Farm, sites, fields and plots</span></div></div>
            <div class="step"><b class="step-no">3</b><div><strong>Crop management</strong><span>Crop masters, varieties and crop cycles</span></div></div>
          </div>
        </article>
      </div>
      <div class="notice">Authentication and farm data are intentionally not enabled yet. We will add them after the backend configuration and data structure are established.</div>`;
  }

  function renderFarmSetup() {
    return `
      <div class="welcome"><h2>Farm setup</h2><p>Farm-specific identity and operating settings will be stored separately from application code.</p></div>
      <article class="panel">
        <h3>Configuration profile</h3>
        <p>The first setup module will capture the farm identity, locale, timezone, units and operational defaults.</p>
        <div class="setup-list">
          <div class="setup-row"><strong>Farm identity</strong><span>Next module</span></div>
          <div class="setup-row"><strong>Country, timezone and locale</strong><span>Next module</span></div>
          <div class="setup-row"><strong>Measurement units and currency</strong><span>Next module</span></div>
          <div class="setup-row"><strong>Operational defaults</strong><span>Next module</span></div>
        </div>
      </article>`;
  }

  function showView(name) {
    const view = views[name] || views.overview;
    $("#page-title").textContent = view.title;
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === name);
    });
    content.innerHTML = view.render();
    if (name === "overview") $("#check-api").addEventListener("click", checkApi);
  }

  async function checkApi() {
    const status = $("#api-status");
    const button = $("#check-api");
    if (!config.apiUrl) {
      status.className = "connection bad";
      status.innerHTML = '<i class="connection-dot"></i><span>API URL is not configured in config.js</span>';
      return;
    }
    button.disabled = true;
    button.textContent = "Checking…";
    status.className = "connection";
    status.innerHTML = '<i class="connection-dot"></i><span>Contacting backend…</span>';
    try {
      const response = await fetch(config.apiUrl, { method: "GET", redirect: "follow", cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const result = await response.json();
      if (!result.ok || result.service !== "farm-management-api") throw new Error("Unexpected API response");
      status.className = "connection good";
      status.innerHTML = '<i class="connection-dot"></i><span>Connected · API ' + escapeHtml(result.version || "unknown") + '</span>';
    } catch (error) {
      status.className = "connection bad";
      status.innerHTML = '<i class="connection-dot"></i><span>Connection failed · ' + escapeHtml(error.message) + '</span>';
    } finally {
      button.disabled = false;
      button.textContent = "Check connection";
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  showView("overview");
})();