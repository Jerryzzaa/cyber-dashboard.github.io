/* Smart SIEM V2 dashboard. This file belongs to dash.html only.
 * chatbot.html is an iframe with its own smart_siem_chat_v2.js.
 */
const NODE2_API_BASE = "http://172.24.5.36:8000/api";

let attackTypesChartInstance = null;
let attackVolumeChartInstance = null;
let mainGlobe = null;
let modalGlobe = null;
let globeLabels = [];
let globeArcs = [];
let refreshInFlight = false;

// Approximate country centroids are presentation markers only. They are never
// claimed to be IP geolocation or attacker origin; unrecognized/reserved labels
// have no point. Explicit Node 2 map_points take precedence when available.
const OBSERVED_COUNTRY_CENTROIDS = Object.freeze({
  TH: { name: "Thailand", lat: 15.87, lng: 100.99 },
  THAILAND: { name: "Thailand", lat: 15.87, lng: 100.99 },
});

async function node2Json(path) {
  const response = await fetch(NODE2_API_BASE + path, { credentials: "omit" });
  if (!response.ok) throw new Error(`Node 2 HTTP ${response.status}`);
  try { return await response.json(); }
  catch (_) { throw new Error("Node 2 returned invalid JSON"); }
}

function fetchDashboardOverview() {
  return node2Json("/ui/overview?scope=all_model_output");
}

async function fetchTimeline(overview) {
  if (Array.isArray(overview.timeline_24h)) return overview.timeline_24h;
  const data = await node2Json("/charts/timeline?bucket=hour&days=1&scope=all_model_output");
  return data.items || [];
}

async function fetchThreatTypes(overview) {
  if (Array.isArray(overview.attack_types)) return overview.attack_types;
  const data = await node2Json("/charts/threat-types?scope=all_model_output");
  return data.items || [];
}

async function fetchTopPorts(overview) {
  if (Array.isArray(overview.destination_ports)) return overview.destination_ports;
  const data = await node2Json("/charts/top-ports?scope=all_model_output");
  return data.items || [];
}

async function fetchGeography(overview) {
  if (Array.isArray(overview.countries) && Array.isArray(overview.map_points)) {
    return { items: overview.countries, map_points: overview.map_points };
  }
  return node2Json("/charts/geography?scope=all_model_output");
}

async function fetchRecentEvents(overview) {
  if (Array.isArray(overview.recent_events)) return overview.recent_events;
  const data = await node2Json("/detections/recent?scope=all_model_output&limit=10");
  return (data.items || []).map((row) => ({
    window_id: row.window_id, time_bin: row.time_bin, observed_ip: row.observed_ip,
    country: row.geography?.country, country_source: row.geography?.country_source,
    primary_dst_ip: row.network?.primary_dst_ip, primary_dst_port: row.network?.primary_dst_port,
    threat_type: row.derived_label?.threat_type, calibrated_risk: row.scores?.calibrated_risk,
    denied_count: row.activity?.denied_count, allowed_count: row.activity?.allowed_count,
    bytes_out: row.network?.bytes_out, bytes_in: row.network?.bytes_in,
    current_stage_names: row.current_stage_names || [],
    sources_display: row.telemetry?.sources_display || [],
    vendors_display: row.telemetry?.vendors_display || [],
  }));
}

function countText(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—";
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function renderKpis(data) {
  const values = document.querySelectorAll(".kpi-value");
  const subtexts = document.querySelectorAll(".kpi-subtext");
  // Backend names stay unchanged. These are canonical model signal windows,
  // not confirmed attacks; total_logs/denied_count count source telemetry rows.
  const metrics = [
    [data.attacks_today, data.attacks_today_log_rows, "source log rows"],
    [data.blocked, data.blocked_denied_log_rows, "denied log rows"],
    [data.critical_active, null, "incidents meeting the UI triage threshold"],
  ];
  metrics.forEach(([value, supportingRows, unit], index) => {
    if (values[index]) values[index].textContent = countText(value);
    if (subtexts[index]) {
      subtexts[index].textContent = supportingRows === null || supportingRows === undefined
        ? unit : `from ${countText(supportingRows)} ${unit}`;
    }
  });
  const latestDay = document.getElementById("latestDataDay");
  if (latestDay) latestDay.textContent = data.latest_data_day
    ? `Latest data day: ${data.latest_data_day} (Bangkok)` : "No model output yet";
  const last24 = data.last_24h ?? data.last_24h_detections;
  const volume = document.getElementById("volumeSummary");
  if (volume) volume.textContent = typeof last24 === "number"
    ? `${countText(last24)} signals from ${countText(data.last_24h_log_rows)} source log rows`
    : "";
}

function initCharts() {
  if (typeof window.Chart !== "function") return;
  const donut = document.getElementById("attackTypeChart");
  if (donut) attackTypesChartInstance = new window.Chart(donut.getContext("2d"), {
    type: "doughnut",
    data: { labels: [], datasets: [{ data: [], backgroundColor: [
      "#ff515b", "#ff9f43", "#03c9d7", "#a49bff", "#20d38a", "#7785a3",
    ], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: { legend: { position: "right", labels: { color: "#d5e4f4", usePointStyle: true,
        pointStyle: "circle", boxWidth: 8, font: { size: 11 } } } } },
    plugins: [{ id: "signalTotal", beforeDraw(chart) {
      const point = chart.getDatasetMeta(0).data[0];
      if (!point) return;
      const total = chart.data.datasets[0].data.reduce((sum, value) => sum + Number(value || 0), 0);
      const ctx = chart.ctx;
      ctx.save();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#8ba2bf"; ctx.font = "11px Segoe UI, sans-serif";
      ctx.fillText("Signals", point.x, point.y - 10);
      ctx.fillStyle = "#f3f8ff"; ctx.font = "bold 18px Segoe UI, sans-serif";
      ctx.fillText(total.toLocaleString("en-US"), point.x, point.y + 12);
      ctx.restore();
    } }],
  });
  const bar = document.getElementById("attackVolumeChart");
  if (bar) attackVolumeChartInstance = new window.Chart(bar.getContext("2d"), {
    type: "bar",
    data: { labels: [], datasets: [{ label: "Model signals", data: [],
      backgroundColor: "#06c8d5", borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { color: "#7890ae" },
        grid: { color: "rgba(142,166,198,.1)" } },
        x: { grid: { display: false }, ticks: { color: "#7890ae", maxRotation: 45 } } } },
  });
}

function renderTimeline(items) {
  if (!attackVolumeChartInstance || !Array.isArray(items)) return;
  attackVolumeChartInstance.data.labels = items.map((row) =>
    String(row.bucket || "").split(" ").pop().slice(0, 5));
  attackVolumeChartInstance.data.datasets[0].data = items.map((row) => Number(row.total) || 0);
  attackVolumeChartInstance.update(); // Node 2 buckets are Bangkok local time.
}

function renderThreatTypes(items) {
  if (!attackTypesChartInstance || !Array.isArray(items)) return;
  attackTypesChartInstance.data.labels = items.map((row) => row.threat_type || "Unspecified");
  attackTypesChartInstance.data.datasets[0].data = items.map((row) => Number(row.count) || 0);
  attackTypesChartInstance.update();
  // Data Exfiltration is a model category, not proof of successful data transfer.
}

function renderTopPorts(items) {
  const container = document.querySelector(".port-legend");
  if (!container || !Array.isArray(items)) return;
  container.replaceChildren();
  if (!items.length) { container.textContent = "No destination-port data"; return; }
  const colors = ["#f8aa19", "#00bfd1", "#ef5058", "#16ce88"];
  for (const [index, item] of items.slice(0, 4).entries()) {
    const row = document.createElement("div");
    row.className = "port-item";
    const swatch = document.createElement("span");
    swatch.className = "port-swatch";
    swatch.style.backgroundColor = colors[index];
    const label = document.createElement("span");
    label.textContent = `Port ${item.port ?? "—"}`;
    const count = document.createElement("span");
    count.className = "port-count";
    count.textContent = `${countText(Number(item.count) || 0)} signals`;
    row.append(swatch, label, count);
    container.appendChild(row);
  }
}

function renderTopCountries(items) {
  const container = document.getElementById("topCountriesList");
  if (!container || !Array.isArray(items)) return;
  container.replaceChildren();
  const max = Math.max(0, ...items.map((row) => Number(row.detection_windows) || 0));
  for (const item of items.slice(0, 5)) {
    const count = Number(item.detection_windows) || 0;
    const row = document.createElement("div");
    row.className = "country-row";
    const head = document.createElement("div");
    head.className = "country-stats";
    const name = document.createElement("span");
    name.textContent = item.country || "Unspecified";
    name.title = `Observed label from ${item.country_source || "unknown source"}; not attacker geolocation`;
    const amount = document.createElement("strong");
    amount.textContent = countText(count);
    head.append(name, amount);
    const bar = document.createElement("div");
    bar.className = "country-bar";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${max ? count * 100 / max : 0}%`;
    bar.appendChild(fill);
    row.append(head, bar);
    container.appendChild(row);
  }
  if (!items.length) container.textContent = "No observed geography labels";
}

function validLat(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90 ? value : null;
}
function validLng(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180 ? value : null;
}

function update3DGlobeData(mapPoints, countries) {
  const labels = [];
  const arcs = [];
  const explicit = Array.isArray(mapPoints) ? mapPoints : [];
  for (const point of explicit) {
    if (!point || typeof point !== "object") continue;
    const lat = validLat(point.lat), lng = validLng(point.lng);
    if (lat !== null && lng !== null) labels.push({
      lat, lng, text: String(point.label || "Observed location"), size: 0.8,
    });
    const startLat = validLat(point.start_lat), startLng = validLng(point.start_lng);
    const endLat = validLat(point.end_lat), endLng = validLng(point.end_lng);
    if ([startLat, startLng, endLat, endLng].every((value) => value !== null)) {
      arcs.push({ startLat, startLng, endLat, endLng, color: ["#02bacb", "#18d68f"] });
    }
  }
  if (!labels.length && !arcs.length) {
    const seen = new Set();
    for (const row of Array.isArray(countries) ? countries : []) {
      const key = String(row.country || "").trim().toUpperCase();
      const location = OBSERVED_COUNTRY_CENTROIDS[key];
      if (!location || seen.has(location.name)) continue;
      seen.add(location.name);
      labels.push({ lat: location.lat, lng: location.lng, size: 0.8,
        text: `${location.name} · country centroid (visual only)` });
    }
    // A centroid is not an observed IP location. Never draw an incoming
    // attack arc from it or map Reserved/private/Unknown to a foreign country.
  }
  globeLabels = labels;
  globeArcs = arcs;
  for (const globe of [mainGlobe, modalGlobe]) {
    if (globe) globe.labelsData(labels).arcsData(arcs);
  }
}

function makeGlobe(container, modal = false) {
  if (!container || typeof window.Globe !== "function") return null;
  const globe = window.Globe()(container)
    .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
    .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
    .backgroundColor("#050b18").showAtmosphere(true)
    .atmosphereColor("#06b6d4").atmosphereAltitude(0.17)
    .arcColor("color").arcDashLength(0.35).arcDashGap(0.25)
    .arcDashAnimateTime(1700).arcStroke(1.2)
    .labelLat("lat").labelLng("lng").labelText("text")
    .labelSize("size").labelColor(() => "#39d6e3").labelDotRadius(0.6);
  const controls = globe.controls();
  if (controls) { controls.autoRotate = true; controls.autoRotateSpeed = modal ? 0.45 : 0.7; }
  globe.pointOfView({ lat: 20, lng: 80, altitude: modal ? 2 : 2.4 });
  globe.width(container.clientWidth).height(container.clientHeight);
  globe.labelsData(globeLabels).arcsData(globeArcs);
  return globe;
}

function init3DGlobe() {
  const container = document.getElementById("globeContainer");
  mainGlobe = makeGlobe(container);
  if (container && mainGlobe) window.addEventListener("resize", () => {
    if (container.isConnected) mainGlobe.width(container.clientWidth).height(container.clientHeight);
  });
  const modal = document.getElementById("globeModal");
  const modalContainer = document.getElementById("modalGlobeContainer");
  document.getElementById("expandGlobeBtn")?.addEventListener("click", () => {
    if (!modal || !modalContainer) return;
    modal.style.display = "block";
    if (!modalGlobe) modalGlobe = makeGlobe(modalContainer, true);
    if (modalGlobe) modalGlobe.width(modalContainer.clientWidth).height(modalContainer.clientHeight);
  });
  document.getElementById("closeGlobeModal")?.addEventListener("click", () => {
    if (modal) modal.style.display = "none";
  });
}

let recentEvents = [];
let activeRiskFilter = "all";
function riskMatches(value) {
  if (activeRiskFilter === "all") return true;
  if (value === null || value === undefined || value === "") return false;
  const risk = Number(value);
  if (!Number.isFinite(risk)) return false;
  if (activeRiskFilter === "80+") return risk >= 80;
  if (activeRiskFilter === "60-79") return risk >= 60 && risk < 80;
  return risk < 60;
}

function renderTable(items) {
  if (Array.isArray(items)) recentEvents = items;
  const body = document.getElementById("eventsTableBody");
  if (!body) return;
  body.replaceChildren();
  const filtered = recentEvents.filter((row) => riskMatches(row.calibrated_risk));
  setText("#event-count", `${filtered.length} of ${recentEvents.length} recent model signals`);
  for (const event of filtered) {
    const tr = document.createElement("tr");
    let time = "—";
    if (event.time_bin) {
      const parsed = new Date(event.time_bin);
      if (!Number.isNaN(parsed.getTime())) time = parsed.toLocaleTimeString("en-GB", {
        timeZone: "Asia/Bangkok", hour12: false,
      });
    }
    const displaySources = Array.isArray(event.sources_display) && event.sources_display.length
      ? event.sources_display : (event.vendors_display || []);
    const cells = [
      time, event.observed_ip || "—", event.country || "—", event.primary_dst_ip || "—",
      event.threat_type || "—", countText(event.calibrated_risk),
      Number(event.primary_dst_port) > 0 ? String(event.primary_dst_port) : "—",
      Number(event.denied_count) > 0 ? "Denied observed" : "Detected",
      Array.isArray(displaySources) ? displaySources.join(", ") || "—" : "—",
    ];
    cells.forEach((value, index) => {
      const td = document.createElement("td");
      td.textContent = value;
      if (index === 1) td.className = "observed-ip";
      if (index === 2) td.title = `Observed country label from ${event.country_source || "unknown source"}`;
      if (index === 5) td.title = "Calibrated triage score, not compromise probability or validated severity";
      if (index === 8) td.title = `Allowed: ${countText(event.allowed_count)}; denied: ${countText(event.denied_count)}; bytes out: ${countText(event.bytes_out)}; bytes in: ${countText(event.bytes_in)}; current stage signals: ${(event.current_stage_names || []).join(", ") || "none"}`;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  }
}

function initFilters() {
  document.querySelectorAll(".filter-btn").forEach((button) => {
    button.addEventListener("click", () => {
      activeRiskFilter = button.dataset.filter || "all";
      document.querySelectorAll(".filter-btn").forEach((item) =>
        item.classList.toggle("active", item === button));
      renderTable();
    });
  });
}

function initClock() {
  const clock = document.getElementById("live-clock");
  if (!clock) return;
  const update = () => { clock.textContent = `${new Date().toLocaleTimeString("en-GB", {
    timeZone: "Asia/Bangkok", hour12: false,
  })} ICT`; };
  update();
  window.setInterval(update, 1000);
}

async function fetchAllData() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    const overview = await fetchDashboardOverview();
    renderKpis(overview);
    const jobs = [
      ["timeline", () => fetchTimeline(overview), renderTimeline],
      ["signal types", () => fetchThreatTypes(overview), renderThreatTypes],
      ["destination ports", () => fetchTopPorts(overview), renderTopPorts],
      ["geography", () => fetchGeography(overview), (value) => {
        renderTopCountries(value.items || []);
        update3DGlobeData(value.map_points || [], value.items || []);
      }],
      ["recent events", () => fetchRecentEvents(overview), renderTable],
    ];
    await Promise.all(jobs.map(async ([name, load, render]) => {
      try { render(await load()); }
      catch (error) { console.error(`Smart SIEM ${name}: ${error.message}`); }
    }));
  } catch (error) {
    // Keep the last good screen if the API is temporarily unavailable.
    console.error(`Smart SIEM overview: ${error.message}`);
  } finally {
    refreshInFlight = false;
  }
}

window.SmartSiemAPI = Object.freeze({
  NODE2_API_BASE, fetchDashboardOverview, fetchTimeline, fetchThreatTypes,
  fetchTopPorts, fetchGeography, fetchRecentEvents, fetchAllData,
});

function startDashboard() {
  initCharts();
  initFilters();
  initClock();
  init3DGlobe();
  void fetchAllData();
  window.setInterval(() => { void fetchAllData(); }, 30000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startDashboard, { once: true });
} else startDashboard();
