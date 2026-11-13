(() => {
  "use strict";
  const config = window.FARM_APP_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  const content = $("#app-content");
  const appName = config.appName || "Farm Management";
  let probeSequence = 0;
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
          <p>Run 10 repeated lightweight API probes and 10 spreadsheet connection probes to calculate median and p95 timings.</p>
          <div id="api-status" class="connection"><i class="connection-dot"></i><span>Diagnostics not run</span></div>
          <div style="margin-top:14px"><button id="check-api" class="button">Run 20-request benchmark</button></div>
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
      <div class="notice">This diagnostic sends 20 sequential read-only health requests. It does not read farm records or write to the database.</div>`;
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
    if (name === "overview") $("#check-api").addEventListener("click", runDiagnostics);
  }

  function loadJsonpProbe(probe) {
    return new Promise((resolve, reject) => {
      const callbackName = "FarmAppProbeCallback" + (++probeSequence);
      const script = document.createElement("script");
      const startedAt = performance.now();
      let settled = false;
      const timeoutId = window.setTimeout(() => finish(new Error("Timed out: " + probe)), 12000);

      function cleanup() {
        window.clearTimeout(timeoutId);
        script.remove();
        try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
      }

      function finish(error, result) {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) return reject(error);
        resolve({
          result: result,
          browserRoundTripMs: Math.round(performance.now() - startedAt)
        });
      }

      window[callbackName] = (result) => finish(null, result);
      script.onerror = () => finish(new Error("Unable to load " + probe + " probe"));
      const separator = config.apiUrl.includes("?") ? "&" : "?";
      script.src = config.apiUrl + separator + "probe=" + encodeURIComponent(probe) +
        "&callback=" + encodeURIComponent(callbackName) + "&_=" + Date.now() + "-" + probeSequence;
      document.head.appendChild(script);
    });
  }

  function percentile(values, fraction) {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
  }

  function stats(values) {
    return {
      median: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      min: Math.min.apply(null, values),
      max: Math.max.apply(null, values)
    };
  }

  async function runDiagnostics() {
    const status = $("#api-status");
    const button = $("#check-api");
    if (!config.apiUrl) {
      setStatus(status, "bad", "API URL is not configured in config.js");
      return;
    }

    button.disabled = true;
    button.textContent = "Testing…";
    setStatus(status, "", "Running 20 sequential read-only requests. Please keep this page open…");

    const lightBrowser = [];
    const lightServer = [];
    const sheetBrowser = [];
    const sheetServer = [];
    const sheetOpen = [];
    const sheetName = [];
    let apiVersion = "unknown";

    try {
      for (let i = 0; i < 10; i++) {
        button.textContent = "Testing " + (i * 2 + 1) + " of 20…";
        const light = await loadJsonpProbe("light");
        if (!light.result.ok || light.result.probe !== "light") {
          throw new Error("Light probe " + (i + 1) + " failed");
        }
        lightBrowser.push(light.browserRoundTripMs);
        lightServer.push(Number(light.result.serverTotalMs) || 0);

        button.textContent = "Testing " + (i * 2 + 2) + " of 20…";
        const sheet = await loadJsonpProbe("sheet");
        if (!sheet.result.ok || sheet.result.status !== "database_connected") {
          throw new Error("Spreadsheet probe " + (i + 1) + " failed");
        }
        apiVersion = sheet.result.version || apiVersion;
        sheetBrowser.push(sheet.browserRoundTripMs);
        sheetServer.push(Number(sheet.result.serverTotalMs) || 0);
        sheetOpen.push(Number(sheet.result.spreadsheetOpenMs) || 0);
        sheetName.push(Number(sheet.result.spreadsheetNameMs) || 0);
      }

      const lb = stats(lightBrowser);
      const ls = stats(lightServer);
      const sb = stats(sheetBrowser);
      const ss = stats(sheetServer);
      const so = stats(sheetOpen);
      const sn = stats(sheetName);

      const summary =
        "20/20 requests passed · API " + apiVersion + "\n" +
        "LIGHT browser median/p95: " + lb.median + "/" + lb.p95 + " ms (min " + lb.min + ", max " + lb.max + ")\n" +
        "LIGHT server median/p95: " + ls.median + "/" + ls.p95 + " ms\n" +
        "SHEETS browser median/p95: " + sb.median + "/" + sb.p95 + " ms (min " + sb.min + ", max " + sb.max + ")\n" +
        "SHEETS server median/p95: " + ss.median + "/" + ss.p95 + " ms\n" +
        "SHEETS open median: " + so.median + " ms · name median: " + sn.median + " ms";
      setStatus(status, "good", summary);
      console.log("FARM_API_LATENCY_BENCHMARK " + JSON.stringify({
        requestsPerProbe: 10,
        lightBrowser: lb, lightServer: ls,
        sheetBrowser: sb, sheetServer: ss,
        spreadsheetOpen: so, spreadsheetName: sn
      }));
    } catch (error) {
      setStatus(status, "bad", "Benchmark failed · " + error.message +
        ". Completed light requests: " + lightBrowser.length +
        "; completed spreadsheet requests: " + sheetBrowser.length);
    } finally {
      button.disabled = false;
      button.textContent = "Run 20-request benchmark";
    }
  }

  function setStatus(element, state, message) {
    element.className = "connection" + (state ? " " + state : "");
    const icon = document.createElement("i");
    icon.className = "connection-dot";
    const label = document.createElement("span");
    label.textContent = message;
    label.style.whiteSpace = "pre-line";
    element.replaceChildren(icon, label);
  }

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  showView("overview");
})();
