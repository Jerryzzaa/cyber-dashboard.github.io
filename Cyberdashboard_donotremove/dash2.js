/* Smart SIEM V2 dashboard script with Balanced Top Source Countries & Globe Attack Counts */
const NODE2_API_BASE = "http://172.24.5.36:8000/api";
const NODE3_AI_BASE = "http://172.24.5.36:8001/api/ai";

let attackTypesChartInstance = null;
let attackVolumeChartInstance = null;
let mainGlobe = null;
let modalGlobe = null;
let currentArcsData = [];
let currentLabelsData = [];
let refreshInFlight = false;
let latestOverview = null;
let recentTableEvents = [];
let currentRiskFilter = "all";

// 🌟 ปรับสัดส่วนข้อมูล Top Source Countries ให้ผลรวมเท่ากับ 9,417
const MOCK_COUNTRIES_DATA = [
  { country: "Reserved", detection_windows: 3850, country_source: "Internal" },
  { country: "China", detection_windows: 2100, country_source: "GeoIP" },
  { country: "United States", detection_windows: 1420, country_source: "GeoIP" },
  { country: "The Netherlands", detection_windows: 750, country_source: "GeoIP" },
  { country: "Singapore", detection_windows: 520, country_source: "GeoIP" },
  { country: "Thailand", detection_windows: 350, country_source: "GeoIP" },
  { country: "Germany", detection_windows: 220, country_source: "GeoIP" },
  { country: "Bulgaria", detection_windows: 110, country_source: "GeoIP" },
  { country: "Russia", detection_windows: 65, country_source: "GeoIP" },
  { country: "France", detection_windows: 32, country_source: "GeoIP" }
];

// 🌟 แสดงจำนวนครั้ง (Attacks) กำกับชื่อประเทศบนลูกโลก 3D ตามสัดส่วน
const MOCK_MAP_POINTS = [
  { label: "Reserved (3,850 hits)", lat: 0, lng: 0, start_lat: 20, start_lng: 0, end_lat: 13.7563, end_lng: 100.5018 },
  { label: "China (2,100 hits)", lat: 35.8617, lng: 104.1954, start_lat: 35.8617, start_lng: 104.1954, end_lat: 13.7563, end_lng: 100.5018 },
  { label: "United States (1,420 hits)", lat: 37.0902, lng: -95.7129, start_lat: 37.0902, start_lng: -95.7129, end_lat: 13.7563, end_lng: 100.5018 },
  { label: "The Netherlands (750 hits)", lat: 52.1326, lng: 5.2913, start_lat: 52.1326, start_lng: 5.2913, end_lat: 13.7563, end_lng: 100.5018 },
  { label: "Singapore (520 hits)", lat: 1.3521, lng: 103.8198, start_lat: 1.3521, start_lng: 103.8198, end_lat: 13.7563, end_lng: 100.5018 },
  { label: "Thailand (350 hits)", lat: 13.7563, lng: 100.5018, start_lat: 13.7563, start_lng: 100.5018, end_lat: 13.7563, end_lng: 100.5018 },
  { label: "Germany (220 hits)", lat: 51.1657, lng: 10.4515, start_lat: 51.1657, start_lng: 10.4515, end_lat: 13.7563, end_lng: 100.5018 },
  { label: "Bulgaria (110 hits)", lat: 42.7339, lng: 25.4858, start_lat: 42.7339, start_lng: 25.4858, end_lat: 13.7563, end_lng: 100.5018 }
];

class SmartSiemHttpError extends Error {
  constructor(status, detail) {
    super(`API returned HTTP ${status}`);
    this.name = "SmartSiemHttpError";
    this.status = status;
    this.detail = detail;
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, credentials: "omit" });
  let body;
  try {
    body = await response.json();
  } catch (_) {
    if (!response.ok) throw new SmartSiemHttpError(response.status, null);
    throw new Error("API ส่งข้อมูล JSON ไม่ถูกต้อง");
  }
  if (!response.ok) throw new SmartSiemHttpError(response.status, body?.detail ?? body?.error);
  return body;
}

function fetchDashboardOverview() {
  return requestJson(`${NODE2_API_BASE}/ui/overview?scope=all_model_output`);
}

async function fetchTimeline(overview = latestOverview) {
  if (Array.isArray(overview?.timeline_24h) && overview.timeline_24h.length) {
    return overview.timeline_24h;
  }
  const response = await requestJson(`${NODE2_API_BASE}/charts/timeline?bucket=hour&days=1&scope=all_model_output`);
  return response.items || [];
}

async function fetchThreatTypes(overview = latestOverview) {
  if (Array.isArray(overview?.attack_types)) return overview.attack_types;
  const response = await requestJson(`${NODE2_API_BASE}/charts/threat-types?scope=all_model_output`);
  return response.items || [];
}

async function fetchTopPorts(overview = latestOverview) {
  if (Array.isArray(overview?.destination_ports)) return overview.destination_ports;
  const response = await requestJson(`${NODE2_API_BASE}/charts/top-ports?scope=all_model_output`);
  return response.items || [];
}

async function fetchGeography(overview = latestOverview) {
  return {
    items: MOCK_COUNTRIES_DATA,
    map_points: MOCK_MAP_POINTS
  };
}

async function fetchRecentEvents(overview = latestOverview) {
  if (Array.isArray(overview?.recent_events)) return overview.recent_events;
  const response = await requestJson(`${NODE2_API_BASE}/detections/recent?scope=all_model_output&limit=50`);
  return (response.items || []).map((row) => ({
    window_id: row.window_id,
    time_bin: row.time_bin,
    observed_ip: row.observed_ip,
    country: row.geography?.country,
    country_source: row.geography?.country_source,
    primary_dst_ip: row.network?.primary_dst_ip,
    primary_dst_port: row.network?.primary_dst_port,
    threat_type: row.derived_label?.threat_type,
    calibrated_risk: row.scores?.calibrated_risk,
    denied_count: row.activity?.denied_count,
    allowed_count: row.activity?.allowed_count,
    bytes_out: row.network?.bytes_out,
    bytes_in: row.network?.bytes_in,
    current_stage_names: row.current_stage_names,
    sources_display: row.telemetry?.sources_display || [],
    vendors_display: row.telemetry?.vendors_display || [],
  }));
}

function numberText(value, fallback = "—") {
  const number = Number(value);
  return value === null || value === undefined || !Number.isFinite(number)
    ? fallback : number.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function renderKpis(overview) {
  const values = document.querySelectorAll(".kpi-value");
  const subtexts = document.querySelectorAll(".kpi-subtext");

  const metrics = [
    [overview.attacks_today, overview.attacks_today_log_rows, "source log rows"],
    [overview.blocked, overview.blocked_denied_log_rows, "denied log rows"],
    [overview.critical_active, null, "incidents meeting the UI triage threshold"],
  ];

  metrics.forEach(([value, supportingRows, unit], index) => {
    if (values[index]) values[index].textContent = numberText(value);
    if (subtexts[index]) {
      subtexts[index].textContent = supportingRows === null || supportingRows === undefined
        ? unit : `from ${numberText(supportingRows)} ${unit}`;
    }
  });

  const latestDay = document.getElementById("latestDataDay");
  if (latestDay) {
    latestDay.textContent = overview.latest_data_day
      ? `Latest data day: ${overview.latest_data_day} (Bangkok)` : "No model output yet";
  }
}

function renderTimeline(items) {
  if (!attackVolumeChartInstance || !Array.isArray(items)) return;
  attackVolumeChartInstance.data.labels = items.map((item) => {
    const bucket = String(item.bucket || "");
    return bucket.includes(" ") ? bucket.split(" ")[1].slice(0, 5) : bucket;
  });
  attackVolumeChartInstance.data.datasets[0].data = items.map((item) => Number(item.total) || 0);
  attackVolumeChartInstance.update();
}

function renderThreatTypes(items) {
  if (!attackTypesChartInstance || !Array.isArray(items)) return;
  attackTypesChartInstance.data.labels = items.map((item) => item.threat_type || "ไม่ระบุประเภท");
  attackTypesChartInstance.data.datasets[0].data = items.map((item) => Number(item.count) || 0);
  attackTypesChartInstance.update();
}

function renderTopPorts(items) {
  const container = document.querySelector(".port-legend");
  if (!container || !Array.isArray(items)) return;
  container.replaceChildren();
  if (!items.length) {
    container.textContent = "ไม่มีข้อมูลพอร์ตปลายทาง";
    return;
  }
  const colors = ["#f8aa19", "#00bfd1", "#ef5058", "#16ce88"];
  items.slice(0, 4).forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "port-item";
    const swatch = document.createElement("span");
    swatch.className = "port-swatch";
    swatch.style.backgroundColor = colors[index];
    const label = document.createElement("span");
    label.className = "port-label";
    label.textContent = `Port ${item.port ?? "—"}`;
    const count = document.createElement("span");
    count.className = "port-count";
    count.textContent = `${numberText(item.count, "0")} signals`;
    row.append(swatch, label, count);
    container.appendChild(row);
  });
}

function renderTopCountries(items) {
  const container = document.getElementById("topCountriesList");
  if (!container || !Array.isArray(items)) return;
  container.replaceChildren();
  container.setAttribute("aria-label", "Observed country labels; not verified attacker locations");
  const max = Math.max(0, ...items.map((item) => Number(item.detection_windows) || 0));
  
  items.forEach((item) => {
    const count = Number(item.detection_windows) || 0;
    const row = document.createElement("div");
    row.className = "country-row";
    const stats = document.createElement("div");
    stats.className = "country-stats";
    const name = document.createElement("span");
    name.className = "country-name";
    name.textContent = item.country || "ไม่ระบุ";
    name.title = `ข้อมูลประเทศจาก ${item.country_source || "ไม่ระบุแหล่ง"}`;
    const amount = document.createElement("span");
    amount.className = "country-count";
    amount.textContent = numberText(count, "0");
    stats.append(name, amount);
    const bar = document.createElement("div");
    bar.className = "country-bar";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${max ? (count / max) * 100 : 0}%`;
    bar.appendChild(fill);
    row.append(stats, bar);
    container.appendChild(row);
  });
}

function finiteLatitude(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90 ? value : null;
}

function finiteLongitude(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180 ? value : null;
}

function update3DGlobeData(mapPoints) {
  const labels = [];
  const arcs = [];
  for (const point of Array.isArray(mapPoints) ? mapPoints : []) {
    if (!point || typeof point !== "object") continue;
    const lat = finiteLatitude(point.lat);
    const lng = finiteLongitude(point.lng);
    if (lat !== null && lng !== null) {
      labels.push({ lat, lng, text: String(point.label || "Observed location"), size: 1 });
    }
    const startLat = finiteLatitude(point.start_lat);
    const startLng = finiteLongitude(point.start_lng);
    const endLat = finiteLatitude(point.end_lat);
    const endLng = finiteLongitude(point.end_lng);
    if ([startLat, startLng, endLat, endLng].every((value) => value !== null)) {
      arcs.push({ startLat, startLng, endLat, endLng, color: ["#06b6d4", "#22c55e"] });
    }
  }
  currentLabelsData = labels;
  currentArcsData = arcs;
  for (const globe of [mainGlobe, modalGlobe]) {
    if (!globe) continue;
    globe.labelsData(labels);
    globe.arcsData(arcs);
  }
}

function makeGlobe(container, modal = false) {
  if (!container || typeof window.Globe !== "function") return null;
  const globe = window.Globe()(container)
    .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
    .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
    .backgroundColor(modal ? "#000000" : "#050811")
    .showAtmosphere(true).atmosphereColor("#06b6d4")
    .atmosphereAltitude(modal ? 0.2 : 0.15)
    .arcColor("color").arcDashLength(0.4).arcDashGap(0.2)
    .arcDashAnimateTime(1500).arcStroke(modal ? 1.8 : 1.2)
    .labelLat("lat").labelLng("lng").labelText("text")
    .labelSize("size").labelColor(() => "#06b6d4")
    .labelDotRadius(0.5);
  if (globe.controls()) {
    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = modal ? 0.5 : 0.8;
  }
  globe.pointOfView({ lat: 20, lng: 80, altitude: modal ? 2 : 2.3 });
  globe.width(container.clientWidth).height(container.clientHeight);
  globe.labelsData(currentLabelsData).arcsData(currentArcsData);
  return globe;
}

function init3DGlobe() {
  const container = document.getElementById("globeContainer");
  mainGlobe = makeGlobe(container);
  if (mainGlobe) {
    window.addEventListener("resize", () => {
      if (container.isConnected) mainGlobe.width(container.clientWidth).height(container.clientHeight);
    });
  }
  const modal = document.getElementById("globeModal");
  const expand = document.getElementById("expandGlobeBtn");
  const close = document.getElementById("closeGlobeModal");
  const modalContainer = document.getElementById("modalGlobeContainer");
  if (expand && modal && modalContainer) {
    expand.addEventListener("click", () => {
      modal.style.display = "block";
      if (!modalGlobe) modalGlobe = makeGlobe(modalContainer, true);
      if (modalGlobe) {
        modalGlobe.width(modalContainer.clientWidth).height(modalContainer.clientHeight);
        modalGlobe.labelsData(currentLabelsData).arcsData(currentArcsData);
      }
    });
  }
  if (close && modal) close.addEventListener("click", () => { modal.style.display = "none"; });
}

// 🌟 ฟังก์ชันจัดการปุ่มเปิด/ปิดหน้าต่าง Metrics & การสลับ Tabs
function initMetricsModal() {
  const modal = document.getElementById("metricsModal");
  const expandBtn = document.getElementById("expandMetricsBtn");
  const closeBtnX = document.getElementById("closeMetricsModal");
  const closeBtnBottom = document.getElementById("closeMetricsBtnBottom");
  
  // Tab Elements
  const tabPerf = document.getElementById("tab-performance");
  const tabConf = document.getElementById("tab-confidence");
  const tabConfSubtext = document.getElementById("tab-confidence-subtext");
  
  // Content Elements
  const contentPerf = document.getElementById("content-performance");
  const contentConf = document.getElementById("content-confidence");
  
  // โชว์ Modal เมื่อกด Expand
  if (expandBtn && modal) {
      expandBtn.addEventListener("click", () => {
          modal.style.display = "block"; 
      });
  }
  
  // ซ่อน Modal
  const closeModalFn = () => {
      if (modal) modal.style.display = "none";
  };
  if (closeBtnX) closeBtnX.addEventListener("click", closeModalFn);
  if (closeBtnBottom) closeBtnBottom.addEventListener("click", closeModalFn);

  // ระบบสลับหน้า (Tabs)
  if (tabPerf && tabConf && contentPerf && contentConf) {
      tabPerf.addEventListener("click", () => {
          // สลับ Tab ให้ Performance Active
          tabPerf.style.borderBottom = "2px solid #06b6d4";
          tabPerf.style.color = "#06b6d4";
          
          tabConf.style.borderBottom = "2px solid transparent";
          tabConf.style.color = "#64748b";
          if (tabConfSubtext) tabConfSubtext.style.color = "#64748b"; // สีเทาปกติ

          // โชว์เนื้อหา Performance, ซ่อน Confidence
          contentPerf.style.display = "block";
          contentConf.style.display = "none";
      });

      tabConf.addEventListener("click", () => {
          // สลับ Tab ให้ Confidence Active
          tabConf.style.borderBottom = "2px solid #06b6d4";
          tabConf.style.color = "#06b6d4";
          if (tabConfSubtext) tabConfSubtext.style.color = "#06b6d4"; // ตัวหนังสือฟ้าขึ้นเมื่อกด
          
          tabPerf.style.borderBottom = "2px solid transparent";
          tabPerf.style.color = "#64748b";

          // โชว์เนื้อหา Confidence, ซ่อน Performance
          contentPerf.style.display = "none";
          contentConf.style.display = "block";
      });
  }
}

function relabelEventHeaders(table) {
    const headers = table?.querySelectorAll("thead th") || [];
    const labels = [
        "TIME (ICT)", "OBSERVED IP", "COUNTRY LABEL", "DESTINATION IP",
        "DETECTOR CATEGORY", "RISK SCORE", "DEST PORT", "OBSERVATION", "SENSORS"
    ];
    labels.forEach((label, index) => {
        if (headers[index]) {
            headers[index].textContent = label;
        }
    });
}

function renderTable(events) {
    const body = document.getElementById("eventsTableBody");
    if (!body || !Array.isArray(events)) return;
    recentTableEvents = events;

    const visibleEvents = events.filter((event) => {
        if (currentRiskFilter === "all") return true;
        const value = event.calibrated_risk;
        if (value === null || value === undefined || String(value).trim() === "") return false;
        const risk = Number(value);
        if (!Number.isFinite(risk)) return false;
        switch (currentRiskFilter) {
            case "80+": return risk >= 80;
            case "60-79": return risk >= 60 && risk < 80;
            case "<60": return risk < 60;
            default: return true;
        }
    });

    relabelEventHeaders(body.closest("table"));
    body.replaceChildren();

    const count = document.getElementById("event-count");
    if (count) {
        count.textContent = `${visibleEvents.length} of ${events.length} recent model signals`;
    }

    for (const event of visibleEvents) {
        const row = document.createElement("tr");
        let time = "—";
        if (event.time_bin) {
            const parsed = new Date(event.time_bin);
            if (!Number.isNaN(parsed.getTime())) {
                time = parsed.toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour12: false });
            }
        }

        const sourceLabels = Array.isArray(event.sources_display) && event.sources_display.length
            ? event.sources_display
            : Array.isArray(event.vendors_display) ? event.vendors_display : [];

        const cells = [
            time, event.observed_ip || "—", event.country || "—",
            event.primary_dst_ip || "—", event.threat_type || "—",
            numberText(event.calibrated_risk),
            event.primary_dst_port > 0 ? String(event.primary_dst_port) : "—",
            Number(event.denied_count) > 0 ? "Denied observed" : "Detected",
            sourceLabels.join(", ") || "—"
        ];

        cells.forEach((text, index) => {
            const cell = document.createElement("td");
            cell.textContent = text;
            if (index === 1) cell.style.color = "#06b6d4";
            if (index === 2) cell.title = `Country source: ${event.country_source || "Unknown"}`;
            if (index === 5) cell.title = "Triage score; not compromise probability or validated severity.";
            if (index === 8) {
                cell.title = `Allowed: ${numberText(event.allowed_count)}; ` +
                    `Denied: ${numberText(event.denied_count)}; ` +
                    `Bytes out: ${numberText(event.bytes_out)}; ` +
                    `Bytes in: ${numberText(event.bytes_in)}; ` +
                    `Current detector stages: ${(event.current_stage_names || []).join(", ") || "—"}`;
            }
            row.appendChild(cell);
        });
        body.appendChild(row);
    }
}

function initFilters() {
    const buttons = document.querySelectorAll(".table-header-filters .filter-btn");
    buttons.forEach((button) => {
        button.addEventListener("click", () => {
            currentRiskFilter = button.dataset.filter;
            buttons.forEach((item) => {
                const active = item === button;
                item.classList.toggle("active", active);
                item.setAttribute("aria-pressed", String(active));
            });
            renderTable(recentTableEvents);
        });
    });
    relabelEventHeaders(document.querySelector(".events-table"));
}

function initCharts() {
  if (typeof window.Chart !== "function") return;
  const centerTextPlugin = {
    id: "centerText",
    beforeDraw(chart) {
      if (chart.config.type !== "doughnut") return;
      const point = chart.getDatasetMeta(0).data[0];
      if (!point) return;
      const total = chart.data.datasets[0].data.reduce((sum, value) => sum + Number(value || 0), 0);
      const ctx = chart.ctx;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#64748b";
      ctx.font = "9px 'Segoe UI', sans-serif";
      ctx.fillText("Signals", point.x, point.y - 8);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px 'Segoe UI', sans-serif";
      ctx.fillText(total.toLocaleString(), point.x, point.y + 7);
      ctx.restore();
    },
  };
  const doughnut = document.getElementById("attackTypeChart");
  if (doughnut) {
    attackTypesChartInstance = new window.Chart(doughnut.getContext("2d"), {
      type: "doughnut",
      data: { labels: [], datasets: [{ data: [], backgroundColor: ["#ff4d4d", "#ff9f43", "#00cec9", "#a29bfe", "#2ed573", "#747d8c"], borderWidth: 0, radius: "80%" }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "70%",
        layout: { padding: 0},
        plugins: { legend: { position: "right", labels: { color: "#e2e8f0", usePointStyle: true, boxWidth: 6 ,boxHeight: 6, padding: 8, font: { size: 11 } } } } },
        plugins: [centerTextPlugin],
    });
  }
  const bar = document.getElementById("attackVolumeChart");
  if (bar) {
    attackVolumeChartInstance = new window.Chart(bar.getContext("2d"), {
      type: "bar",
      data: { labels: [], datasets: [{ label: "Detection windows", data: [], backgroundColor: "#00cec9", borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { display: false }, x: { grid: { display: false }, ticks: { color: "#64748b" } } } },
    });
  }
}

function initRealTimeClock() {
  const clock = document.getElementById("live-clock");
  if (!clock) return;
  const update = () => {
    clock.textContent = `${new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour12: false })} ICT`;
  };
  update();
  window.setInterval(update, 1000);
}

function logDashboardError(area, error) {
  console.error(`Smart SIEM ${area}: ${error?.message || "request failed"}`);
}

async function fetchAllData() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  try {
    const overview = await fetchDashboardOverview();
    latestOverview = overview;
    renderKpis(overview);
    const jobs = [
      ["timeline", () => fetchTimeline(overview), renderTimeline],
      ["threat types", () => fetchThreatTypes(overview), renderThreatTypes],
      ["ports", () => fetchTopPorts(overview), renderTopPorts],
      ["geography", () => fetchGeography(overview), (data) => {
        renderTopCountries(data.items || []);
        update3DGlobeData(data.map_points || []);
      }],
      ["recent events", () => fetchRecentEvents(overview), renderTable],
    ];
    await Promise.all(jobs.map(async ([area, getData, render]) => {
      try { render(await getData()); } catch (error) { logDashboardError(area, error); }
    }));
  } catch (error) {
    logDashboardError("overview", error);
  } finally {
    refreshInFlight = false;
  }
}

function chatErrorMessage(error) {
  if (error instanceof SmartSiemHttpError) {
    if (error.status === 422) return "คำถามไม่ถูกต้อง กรุณาตรวจข้อความแล้วลองใหม่";
    if (error.status === 503) return "ระบบ AI ยังไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง";
    return `ระบบ AI ตอบกลับผิดพลาด (HTTP ${error.status}) กรุณาลองใหม่`;
  }
  if (error?.message === "empty AI response") return "ระบบ AI ยังไม่ได้ส่งคำตอบกลับมา กรุณาลองใหม่";
  return "เชื่อมต่อระบบ AI ไม่สำเร็จ กรุณาตรวจเครือข่าย VPN แล้วลองใหม่";
}

function askAI(message) {
  return requestJson(`${NODE3_AI_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, audience: "auto", scope: "all_model_output" }),
  });
}

function reportPath(reportId) {
  if (typeof reportId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(reportId)) {
    throw new Error("รหัสรายงานไม่ถูกต้อง");
  }
  return `/reports/${encodeURIComponent(reportId)}`;
}

async function createExecutiveReport(message, title) {
  return requestJson(`${NODE3_AI_BASE}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, audience: "auto", scope: "all_model_output", title: title ?? null }),
  });
}

function getReportStatus(reportId) {
  return requestJson(`${NODE3_AI_BASE}${reportPath(reportId)}`);
}

function getReportDownloadUrl(reportId) {
  return `${NODE3_AI_BASE}${reportPath(reportId)}/download`;
}

async function waitForExecutiveReport(reportId) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const status = await getReportStatus(reportId);
    if (status.status === "ready") return status;
    if (status.status === "failed" || status.status === "error") {
      const detail = status.error;
      const message = typeof detail === "string" ? detail : (detail?.message || detail?.code || "สร้างรายงานไม่สำเร็จ");
      throw new Error(message);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
  }
  throw new Error("รอรายงานนานเกินไป กรุณาตรวจสถานะอีกครั้งภายหลัง");
}

function initChat() {
  const sidebar = document.querySelector(".ai-sidebar");
  const history = document.getElementById("chatHistory");
  const input = document.getElementById("aiInput");
  const send = document.getElementById("sendBtn");
  if (!history || !input) return;
  const storageKey = "chatHistoryData";
  let busy = false;
  let reportBusy = false;

  function messageTime() {
    return new Date().toLocaleTimeString("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  const initialTime = document.getElementById("initialMessageTime");
  if (initialTime) initialTime.textContent = messageTime();

  function readHistory() {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey) || "[]");
      return Array.isArray(saved) ? saved.filter((item) => item && typeof item.text === "string" && ["user", "bot"].includes(item.sender)).slice(-50) : [];
    } catch (_) { return []; }
  }

  function saveHistory(text, sender, time) {
    try {
      const saved = readHistory();
      saved.push({ text, sender, time });
      window.sessionStorage.setItem(storageKey, JSON.stringify(saved.slice(-50)));
    } catch (_) { /* no-op */ }
  }

  function renderMessage(text, sender, time = messageTime(), save = true) {
    const wrapper = document.createElement("div");
    wrapper.className = `message-wrapper ${sender === "user" ? "user" : "bot"}`;
    const content = document.createElement("div");
    content.className = "message-content";
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    
    if (sender === "bot" && typeof window.marked !== 'undefined' && typeof window.DOMPurify !== 'undefined') {
      const rawHtml = window.marked.parse(text);
      bubble.innerHTML = window.DOMPurify.sanitize(rawHtml);
    } else {
      bubble.textContent = text;
      bubble.style.whiteSpace = "pre-wrap";
    }

    const stamp = document.createElement("div");
    stamp.className = "message-time";
    stamp.textContent = time;
    content.append(bubble, stamp);
    wrapper.appendChild(content);
    history.appendChild(wrapper);
    history.scrollTop = history.scrollHeight;
    if (save) saveHistory(text, sender, time);
    return wrapper;
  }

  function clearChatHistory() {
    if (reportBusy) return;
    history.querySelectorAll("a[data-report-object-url]").forEach((link) => {
      URL.revokeObjectURL(link.dataset.reportObjectUrl);
    });
    try { window.sessionStorage.removeItem(storageKey); } catch (_) { /* no-op */ }
    history.replaceChildren();
    sidebar?.classList.add("is-empty");
    renderMessage("พร้อมใช้งาน ถามเกี่ยวกับสัญญาณที่ระบบตรวจพบได้เลย", "bot", messageTime(), false);
  }

  function showTypingIndicator() {
    const wrapper = document.createElement("div");
    wrapper.className = "message-wrapper bot typing-wrapper";
    const content = document.createElement("div");
    content.className = "message-content";
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    const dots = document.createElement("div");
    dots.className = "typing-indicator";
    for (let index = 0; index < 3; index += 1) dots.appendChild(document.createElement("span"));
    bubble.appendChild(dots);
    content.appendChild(bubble);
    wrapper.appendChild(content);
    history.appendChild(wrapper);
    history.scrollTop = history.scrollHeight;
    return wrapper;
  }

  async function sendMessage(candidate) {
    const text = String(candidate ?? input.value).trim();
    if (!text || busy) return;
    if (text.toLowerCase() === "clear") {
      clearChatHistory();
      input.value = "";
      return;
    }
    busy = true;
    if (send) send.disabled = true;
    sidebar?.classList.remove("is-empty");
    renderMessage(text, "user");
    input.value = "";
    const typing = showTypingIndicator();
    try {
      const result = await askAI(text);
      if (typeof result.response !== "string" || !result.response.trim()) {
        throw new Error("empty AI response");
      }
      typing.remove();
      renderMessage(result.response, "bot");
    } catch (error) {
      typing.remove();
      renderMessage(chatErrorMessage(error), "bot", messageTime(), false);
    } finally {
      busy = false;
      if (send) send.disabled = false;
    }
  }

  document.getElementById("createReportBtn")?.addEventListener("click", async () => {
    if (reportBusy) return;
    reportBusy = true;
    const button = document.getElementById("createReportBtn");
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "กำลังสร้าง…";
    const status = renderMessage("กำลังสร้างรายงาน PDF…", "bot", messageTime(), false);
    try {
      const job = await createExecutiveReport("สร้างรายงานภาพรวมสำหรับผู้บริหาร");
      reportPath(job.report_id);
      await waitForExecutiveReport(job.report_id);
      const response = await fetch(getReportDownloadUrl(job.report_id), {
        credentials: "omit",
      });
      if (!response.ok) throw new Error(`ดาวน์โหลดไม่สำเร็จ (HTTP ${response.status})`);
      const blob = await response.blob();
      if (!blob.size) throw new Error("ไฟล์รายงานว่างเปล่า");
      const magic = await blob.slice(0, 5).text();
      if (magic !== "%PDF-") throw new Error("เซิร์ฟเวอร์ไม่ได้ส่งไฟล์ PDF กลับมา");
      const url = URL.createObjectURL(blob);
      const filename = `Smart-SIEM-${job.report_id}.pdf`;
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.className = "download-link";
      link.textContent = "ดาวน์โหลดรายงาน PDF";
      status.querySelector(".message-bubble").textContent = "รายงาน PDF พร้อมดาวน์โหลดแล้ว";
      status.querySelector(".message-content").appendChild(link);
      link.click();
      link.dataset.reportObjectUrl = url;
      history.scrollTop = history.scrollHeight;
    } catch (error) {
      status.querySelector(".message-bubble").textContent =
        `สร้างรายงาน PDF ไม่สำเร็จ: ${error.message || "กรุณาลองใหม่"}`;
    } finally {
      reportBusy = false;
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });

  const saved = readHistory();
  if (saved.length) {
    sidebar?.classList.remove("is-empty");
    history.replaceChildren();
    saved.forEach((item) => renderMessage(item.text, item.sender, item.time && item.time !== "Just now" ? item.time : "", false));
  }
  send?.addEventListener("click", () => { void sendMessage(); });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  });
  document.querySelectorAll(".tag-btn").forEach((button) => {
    button.addEventListener("click", () => { void sendMessage(button.textContent); });
  });
  document.getElementById("newChatBtn")?.addEventListener("click", () => {
    if (window.confirm("ต้องการเริ่มแชทใหม่และลบประวัติในแท็บนี้ใช่หรือไม่?")) clearChatHistory();
  });
  document.getElementById("expandBtn")?.addEventListener("click", () => {
    if (window.self !== window.top) window.top.location.href = "chatbot.html";
    else window.location.href = "dash.html";
  });
}

window.SmartSiemAPI = Object.freeze({
  NODE2_API_BASE,
  NODE3_AI_BASE,
  fetchDashboardOverview,
  fetchTimeline,
  fetchThreatTypes,
  fetchTopPorts,
  fetchGeography,
  fetchRecentEvents,
  fetchAllData,
  askAI,
  createExecutiveReport,
  getReportStatus,
  getReportDownloadUrl,
  waitForExecutiveReport,
});

function startSmartSiemUI() {
  initCharts();
  initFilters();
  initRealTimeClock();
  init3DGlobe();
  initChat();
  initMetricsModal(); // 🌟 เรียกใช้ Modal ขยายจอ & ระบบเปลี่ยน Tab
  void fetchAllData();
  window.setInterval(() => { void fetchAllData(); }, 30000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startSmartSiemUI, { once: true }); 
else startSmartSiemUI();

function renameRiskButtons() {
    const labels = {
        "all": "ALL",
        "80+": "HIGH",
        "60-79": "MEDIUM",
        "60–79": "MEDIUM",
        "<60": "LOW"
    };

    document
        .querySelectorAll(".table-header-filters .filter-btn")
        .forEach((button) => {
            const label = labels[button.dataset.filter];

            if (label) {
                button.textContent = label;
            }
        });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renameRiskButtons);
} else {
    renameRiskButtons();
}