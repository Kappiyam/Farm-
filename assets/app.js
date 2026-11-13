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

  function checkApi() {
    const status = $("#api-status");
    const button = $("#check-api");
    if (!config.apiUrl) {
      setStatus(status, "bad", "API URL is not configured in config.js");
      return;
    }

    button.disabled = true;
    button.textContent = "Checking…";
    setStatus(status, "", "Contacting backend…");

    const callbackName = "FarmAppHealthCallback";
    const script = document.createElement("script");
    let settled = false;
    const timeoutId = window.setTimeout(() => finish(new Error("Request timed out")), 12000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      script.remove();
      try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
      button.disabled = false;
      button.textContent = "Check connection";
    }

    function finish(error, result) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        setStatus(status, "bad", "Connection failed · " + error.message);
        return;
      }
      if (!result || !result.ok || result.service !== "farm-management-api" ||
          result.status !== "database_connected") {
        setStatus(status, "bad", "Backend responded, but database verification failed");
        return;
      }
      setStatus(status, "good", "Connected · API " + (result.version || "unknown") +
        " · " + (result.databaseName || "Database ready"));
    }

    window[callbackName] = (result) => finish(null, result);
    script.onerror = () => finish(new Error("Unable to load Apps Script health response"));
    const separator = config.apiUrl.includes("?") ? "&" : "?";
    script.src = config.apiUrl + separator + "callback=" + callbackName +
      "&_=" + Date.now();
    document.head.appendChild(script);
  }

  function setStatus(element, state, message) {
    element.className = "connection" + (state ? " " + state : "");
    const icon = document.createElement("i");
    icon.className = "connection-dot";
    const label = document.createElement("span");
    label.textContent = message;
    element.replaceChildren(icon, label);
  }

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  showView("overview");
})();
