// ==========================================
// การตั้งค่า API
// ==========================================
const API_BASE = "http://172.25.100.6:8000/api";

let attackTypesChartInstance;
let attackVolumeChartInstance;
let allAlertsData = []; 

// ฐานข้อมูลพิกัด ละติจูด/ลองจิจูด (Lat/Lng) สำหรับลูกโลก 3D
const COUNTRY_GEO = {
    'TH': { name: 'Thailand', lat: 13.7563, lng: 100.5018 },
    'THAILAND': { name: 'Thailand', lat: 13.7563, lng: 100.5018 },
    'US': { name: 'United States', lat: 37.0902, lng: -95.7129 },
    'USA': { name: 'United States', lat: 37.0902, lng: -95.7129 },
    'UNITED STATES': { name: 'United States', lat: 37.0902, lng: -95.7129 },
    'RU': { name: 'Russia', lat: 61.5240, lng: 105.3188 },
    'RUSSIA': { name: 'Russia', lat: 61.5240, lng: 105.3188 },
    'CN': { name: 'China', lat: 35.8617, lng: 104.1954 },
    'CHINA': { name: 'China', lat: 35.8617, lng: 104.1954 },
    'FR': { name: 'France', lat: 46.2276, lng: 2.2137 },
    'FRANCE': { name: 'France', lat: 46.2276, lng: 2.2137 },
    'DE': { name: 'Germany', lat: 51.1657, lng: 10.4515 },
    'GERMANY': { name: 'Germany', lat: 51.1657, lng: 10.4515 },
    'GB': { name: 'United Kingdom', lat: 55.3781, lng: -3.4360 },
    'UK': { name: 'United Kingdom', lat: 55.3781, lng: -3.4360 },
    'JP': { name: 'Japan', lat: 36.2048, lng: 138.2529 },
    'JAPAN': { name: 'Japan', lat: 36.2048, lng: 138.2529 },
    'SG': { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
    'SINGAPORE': { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
    'IN': { name: 'India', lat: 20.5937, lng: 78.9629 },
    'INDIA': { name: 'India', lat: 20.5937, lng: 78.9629 },
    'NL': { name: 'Netherlands', lat: 52.1326, lng: 5.2913 },
    'NETHERLANDS': { name: 'Netherlands', lat: 52.1326, lng: 5.2913 },
    'RESERVED-DOCUMENTATION': { name: 'Reserved (EU)', lat: 50.1109, lng: 8.6821 }
};

// พิกัดเป้าหมายหลัก (Thailand Target)
const TARGET_GEO = { name: 'IN TARGET (TH)', lat: 13.7563, lng: 100.5018 };

let mainGlobe = null;
let modalGlobe = null;
let currentArcsData = [];
let currentLabelsData = [];

document.addEventListener("DOMContentLoaded", () => {
    initCharts();
    initFilters();
    initRealTimeClock();
    init3DGlobe();
    
    fetchAllData();
    setInterval(fetchAllData, 30000); 
});

function fetchAllData() {
    fetchStats();
    fetchTimeline();
    fetchTopSources();
    fetchThreatTypes();
    fetchTopPorts();
    fetchAlerts();
}

// ==========================================
// 1. API: GET /api/stats
// ==========================================
async function fetchStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        if (!response.ok) return;
        const data = await response.json();

        const kpiValues = document.querySelectorAll('.kpi-value');
        if (kpiValues.length >= 3) {
            const totalAlerts = data?.totals?.alerts || data?.total || 0;
            const criticalActive = data?.incidents?.needs_llm || data?.needs_llm || 0;
            const blockedCount = data?.blocked || data?.totals?.blocked || 0;

            kpiValues[0].textContent = Number(totalAlerts).toLocaleString();
            kpiValues[1].textContent = Number(blockedCount).toLocaleString();
            kpiValues[2].textContent = Number(criticalActive).toLocaleString();

            const kpiSubs = document.querySelectorAll('.kpi-subtext');
            if (kpiSubs.length >= 2 && totalAlerts > 0) {
                const blockRate = ((blockedCount / totalAlerts) * 100).toFixed(1);
                kpiSubs[1].textContent = `${blockRate}% block rate`;
            }
        }
    } catch (error) { console.error("Error fetching stats:", error); }
}

// ==========================================
// 2. API: GET /api/charts/timeline
// ==========================================
async function fetchTimeline() {
    try {
        const response = await fetch(`${API_BASE}/charts/timeline?bucket=hour&days=1`);
        if (!response.ok) return;
        const raw = await response.json();
        const items = raw.items || [];
        
        if (items.length > 0 && attackVolumeChartInstance) {
            const labels = items.map(item => {
                const timeStr = item.bucket || "";
                return timeStr.includes(" ") ? timeStr.split(" ")[1].substring(0, 5) : timeStr;
            });
            const counts = items.map(item => Number(item.total || 0));

            attackVolumeChartInstance.data.labels = labels;
            attackVolumeChartInstance.data.datasets[0].data = counts;
            attackVolumeChartInstance.update();
        }
    } catch (error) { console.error("Error fetching timeline:", error); }
}

// ==========================================
// 3. API: GET /api/charts/top-sources & 3D Globe Sync
// ==========================================
async function fetchTopSources() {
    try {
        const response = await fetch(`${API_BASE}/charts/top-sources`);
        if (!response.ok) return;
        const raw = await response.json();
        const items = raw.items || [];
        
        const countryMap = {};
        items.forEach(item => {
            let country = item.country || 'Unknown';
            let alertsCount = Number(item.alerts || item.count || 1);
            if (country && country !== '-' && country !== 'Unknown') {
                countryMap[country] = (countryMap[country] || 0) + alertsCount;
            }
        });

        const sortedCountries = Object.keys(countryMap)
            .map(name => ({ name: name, count: countryMap[name] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
            
        renderTopCountries(sortedCountries);
        update3DGlobeData(sortedCountries);
    } catch (error) { console.error("Error fetching top sources:", error); }
}

function renderTopCountries(countriesData) {
    const container = document.getElementById('topCountriesList');
    if (!container) return;
    container.innerHTML = ''; 

    const maxCount = Math.max(...countriesData.map(c => Number(c.count || 0)));

    countriesData.forEach(item => {
        const count = Number(item.count || 0);
        const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
        const countryName = item.name || 'Unknown';

        const row = document.createElement('div');
        row.className = 'country-row';
        row.innerHTML = `
            <div class="country-stats">
                <span class="country-name">${countryName}</span>
                <span class="country-count">${count.toLocaleString()}</span>
            </div>
            <div class="country-bar">
                <div class="bar-fill" style="width: ${percentage}%;"></div>
            </div>
        `;
        container.appendChild(row);
    });
}

// ==========================================
// 3D Globe Implementation
// ==========================================
function init3DGlobe() {
    const container = document.getElementById('globeContainer');
    if (!container) return;

    mainGlobe = Globe()(container)
        .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
        .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
        .backgroundColor('#050811')
        .showAtmosphere(true)
        .atmosphereColor('#06b6d4')
        .atmosphereAltitude(0.15)
        .arcColor('color')
        .arcDashLength(0.4)
        .arcDashGap(0.2)
        .arcDashAnimateTime(1500)
        .arcStroke(1.2)
        .labelLat('lat')
        .labelLng('lng')
        .labelText('text')
        .labelSize('size')
        .labelColor(() => '#06b6d4')
        .labelDotRadius(0.5)
        .labelResolution(2);

    mainGlobe.controls().autoRotate = true;
    mainGlobe.controls().autoRotateSpeed = 0.8;
    mainGlobe.pointOfView({ lat: 20, lng: 80, altitude: 2.3 });

    const resizeGlobe = () => {
        if (mainGlobe && container) {
            mainGlobe.width(container.clientWidth);
            mainGlobe.height(container.clientHeight);
        }
    };
    window.addEventListener('resize', resizeGlobe);
    setTimeout(resizeGlobe, 300);

    const modal = document.getElementById('globeModal');
    const expandBtn = document.getElementById('expandGlobeBtn');
    const closeBtn = document.getElementById('closeGlobeModal');
    const modalContainer = document.getElementById('modalGlobeContainer');

    expandBtn.addEventListener('click', () => {
        modal.style.display = 'block';
        if (!modalGlobe) {
            modalGlobe = Globe()(modalContainer)
                .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
                .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
                .backgroundColor('#000000')
                .showAtmosphere(true)
                .atmosphereColor('#06b6d4')
                .atmosphereAltitude(0.2)
                .arcColor('color')
                .arcDashLength(0.4)
                .arcDashGap(0.2)
                .arcDashAnimateTime(1200)
                .arcStroke(1.8)
                .labelLat('lat')
                .labelLng('lng')
                .labelText('text')
                .labelSize('size')
                .labelColor(() => '#06b6d4')
                .labelDotRadius(0.8);

            modalGlobe.controls().autoRotate = true;
            modalGlobe.controls().autoRotateSpeed = 0.5;
        }

        modalGlobe.width(modalContainer.clientWidth);
        modalGlobe.height(modalContainer.clientHeight);
        modalGlobe.arcsData(currentArcsData);
        modalGlobe.labelsData(currentLabelsData);
        modalGlobe.pointOfView({ lat: 20, lng: 80, altitude: 2.0 });
    });

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
}

// 🌟 ฟังก์ชันอัปเดตข้อมูลลูกโลก แสดงจำนวนการโจมตีของประเทศไทย (TARGET)
function update3DGlobeData(topCountries) {
    const arcs = [];
    const labels = [];

    // 1. ค้นหาจำนวนการโจมตีของประเทศไทยจาก topCountries
    const thData = topCountries.find(item => {
        const nameUpper = String(item.name || '').toUpperCase();
        return nameUpper === 'TH' || nameUpper === 'THAILAND';
    });
    const thCount = thData ? Number(thData.count || 0).toLocaleString() : 'Active';

    // 2. ปักป้าย TARGET ประเทศไทย พร้อมแสดงยอดตัวเลข
    labels.push({
        lat: TARGET_GEO.lat,
        lng: TARGET_GEO.lng,
        text: `TARGET: Thailand (${thCount})`,
        size: 1.2
    });

    const fallbackList = [
        { lat: 48.8566, lng: 2.3522, name: 'France' },
        { lat: 55.7558, lng: 37.6173, name: 'Russia' },
        { lat: 37.7749, lng: -122.4194, name: 'USA' },
        { lat: 35.6762, lng: 139.6503, name: 'Japan' }
    ];

    topCountries.forEach((item, idx) => {
        const nameUpper = String(item.name || '').toUpperCase();
        const isThailand = nameUpper === 'TH' || nameUpper === 'THAILAND';

        let geo = COUNTRY_GEO[nameUpper];
        if (!geo) {
            const fb = fallbackList[idx % fallbackList.length];
            geo = { name: item.name, lat: fb.lat, lng: fb.lng };
        }

        const arcColor = idx === 0 ? ['#ef4444', '#06b6d4'] : (idx < 3 ? ['#f97316', '#06b6d4'] : ['#eab308', '#06b6d4']);

        arcs.push({
            startLat: geo.lat,
            startLng: geo.lng,
            endLat: TARGET_GEO.lat,
            endLng: TARGET_GEO.lng,
            color: arcColor
        });

        // สร้าง Label สำหรับประเทศต้นทางอื่นๆ
        if (!isThailand) {
            labels.push({
                lat: geo.lat,
                lng: geo.lng,
                text: `${geo.name} (${Number(item.count || 0).toLocaleString()})`,
                size: 1.0
            });
        }
    });

    currentArcsData = arcs;
    currentLabelsData = labels;

    if (mainGlobe) {
        mainGlobe.arcsData(arcs);
        mainGlobe.labelsData(labels);
    }
    if (modalGlobe) {
        modalGlobe.arcsData(arcs);
        modalGlobe.labelsData(labels);
    }
}

// ==========================================
// 4. API: GET /api/charts/threat-types
// ==========================================
async function fetchThreatTypes() {
    try {
        const response = await fetch(`${API_BASE}/charts/threat-types`);
        if (!response.ok) return;
        const raw = await response.json();
        const items = raw.items || [];
        
        if (items.length > 0 && attackTypesChartInstance) {
            const labels = items.map(item => item.threat_type || item.type || 'Unknown');
            const counts = items.map(item => Number(item.count || 0));
            
            attackTypesChartInstance.data.labels = labels;
            attackTypesChartInstance.data.datasets[0].data = counts;
            attackTypesChartInstance.update();
        }
    } catch (error) { console.error("Error fetching threat types:", error); }
}

// ==========================================
// 5. API: GET /api/charts/top-ports
// ==========================================
async function fetchTopPorts() {
    try {
        const response = await fetch(`${API_BASE}/charts/top-ports`);
        if (!response.ok) return;
        const raw = await response.json();
        const items = raw.items || [];
        
        const portLegendContainer = document.querySelector('.port-legend');
        if (!portLegendContainer) return;
        
        portLegendContainer.innerHTML = '';
        const topPorts = items.slice(0, 4);

        if (topPorts.length === 0) {
            portLegendContainer.innerHTML = '<div style="color: #64748b; font-size: 11px;">No active ports data</div>';
            return;
        }

        const portColors = ['#ff9800', '#00bcd4', '#f44336', '#00e676'];
        topPorts.forEach((item, index) => {
            const color = portColors[index % portColors.length];
            const portNum = item.port || '-';
            const count = Number(item.count || 0);
            
            const portItem = document.createElement('div');
            portItem.className = 'port-item';
            portItem.style.display = 'flex';
            portItem.style.alignItems = 'center';
            portItem.style.gap = '8px';
            portItem.style.marginBottom = '6px';
            
            portItem.innerHTML = `
                <span style="background: ${color}; width: 28px; height: 8px; border-radius: 4px; display: inline-block; flex-shrink: 0;"></span> 
                <span style="color: #f8fafc; font-weight: 600; font-size: 11px;">Port ${portNum}</span>
                <span style="color: #64748b; font-size: 10px; margin-left: auto;">(${count.toLocaleString()} hits)</span>
            `;
            portLegendContainer.appendChild(portItem);
        });
    } catch (error) { console.error("Error fetching top ports:", error); }
}

// ==========================================
// 6. API: GET /api/alerts
// ==========================================
async function fetchAlerts() {
    try {
        const response = await fetch(`${API_BASE}/alerts?limit=50`);
        if (!response.ok) return;
        const raw = await response.json();
        
        allAlertsData = raw.items || [];
        
        const activeFilterBtn = document.querySelector('.filter-btn.active');
        const currentFilter = activeFilterBtn ? activeFilterBtn.getAttribute('data-filter') : 'ALL';
        
        renderTable(currentFilter);
    } catch (error) { console.error("Error fetching alerts:", error); }
}

function renderTable(filterMode = 'ALL') {
    const tbody = document.getElementById('eventsTableBody');
    if(!tbody) return;
    tbody.innerHTML = ''; 

    const filteredLogs = filterMode === 'ALL' 
        ? allAlertsData 
        : allAlertsData.filter(log => {
            const sev = String(log.severity || '').toUpperCase();
            return sev === filterMode;
        });
    
    const eventCountEl = document.getElementById('event-count');
    if (eventCountEl) eventCountEl.textContent = `${filteredLogs.length} events`;

    filteredLogs.forEach(log => {
        const tr = document.createElement('tr');
        
        let formattedTime = '-';
        if (log.time) {
            const dateObj = new Date(log.time);
            if (!isNaN(dateObj)) {
                formattedTime = dateObj.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            } else {
                formattedTime = log.time;
            }
        }

        const srcIp = log.src_ip || '-';
        const country = log.country || '-';
        const dstIp = log.dst_ip || '-';
        const type = log.threat_type || '-';
        const severity = String(log.severity || 'INFO').toUpperCase();
        const port = log.dst_port || '-';
        const status = String(log.status || 'DETECTED').toUpperCase();
        
        const pkts = log.conn_count !== undefined ? log.conn_count : (log.bytes_out !== undefined ? log.bytes_out : 0);

        let sevClass = 'sev-low';
        if(severity === 'CRITICAL') sevClass = 'sev-critical';
        else if(severity === 'HIGH') sevClass = 'sev-high';
        else if(severity === 'MEDIUM') sevClass = 'sev-medium';
        else if(severity === 'INFO') sevClass = 'sev-low';

        let statusColor = '#cbd5e1';
        if(status === 'BLOCKED') statusColor = '#10b981'; 
        else if(status === 'DETECTED') statusColor = '#eab308'; 
        else if(status === 'MITIGATED') statusColor = '#3b82f6'; 

        tr.innerHTML = `
            <td>${formattedTime}</td>
            <td style="color: #06b6d4;">${srcIp}</td>
            <td>${country}</td>
            <td>${dstIp}</td>
            <td>${type}</td>
            <td><span class="${sevClass}">${severity}</span></td>
            <td style="color: #e2e8f0; font-weight: 500;">${port}</td>
            <td style="color: ${statusColor}; font-weight: bold;">${status}</td>
            <td style="text-align: right; color: #64748b;">${Number(pkts).toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
    });
}

function initFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderTable(e.target.getAttribute('data-filter'));
        });
    });
}

function initCharts() {
    const chartColors = ['#ff4d4d', '#ff9f43', '#00cec9', '#a29bfe', '#2ed573', '#747d8c'];
    const centerTextPlugin = {
        id: 'centerText',
        beforeDraw: function(chart) {
            if (chart.config.type !== 'doughnut') return;
            const ctx = chart.ctx;
            const meta = chart.getDatasetMeta(0);
            if (!meta.data.length) return;
            const centerX = meta.data[0].x;
            const centerY = meta.data[0].y;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = "9px 'Segoe UI', sans-serif";
            ctx.fillStyle = "#64748b";
            ctx.fillText("Total", centerX, centerY - 8);
            ctx.font = "bold 13px 'Segoe UI', sans-serif";
            ctx.fillStyle = "#ffffff";
            const total = chart.config.data.datasets[0].data.reduce((a, b) => Number(a) + Number(b), 0);
            ctx.fillText(total.toLocaleString(), centerX, centerY + 7);
            ctx.restore();
        }
    };

    const ctxDoughnut = document.getElementById('attackTypeChart');
    if(ctxDoughnut) {
        attackTypesChartInstance = new Chart(ctxDoughnut.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Loading...'],
                datasets: [{ data: [1], backgroundColor: chartColors, borderWidth: 0 }]
            },
            options: {
                responsive: true, 
                maintainAspectRatio: false, 
                layout: { padding: 0 },
                plugins: { 
                    legend: { 
                        position: 'right', 
                        labels: { 
                            color: '#e2e8f0', 
                            usePointStyle: true, 
                            pointStyle: 'circle', 
                            boxWidth: 5, 
                            font: { family: 'monospace', size: 9 }, 
                            padding: 4 
                        } 
                    } 
                },
                cutout: '68%'
            },
            plugins: [centerTextPlugin]
        });
    }

    const ctxBar = document.getElementById('attackVolumeChart');
    if(ctxBar) {
        attackVolumeChartInstance = new Chart(ctxBar.getContext('2d'), {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Events',
                    data: [],
                    backgroundColor: '#00cec9',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                scales: { y: { display: false }, x: { grid: { display: false }, ticks: { color: '#64748b' } } }
            }
        });
    }
}

function initRealTimeClock() {
    const clockElement = document.getElementById('live-clock');
    if (!clockElement) return;

    function updateClock() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-GB', {
            timeZone: 'Asia/Bangkok',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        clockElement.textContent = `${timeString} ICT`;
    }

    updateClock();
    setInterval(updateClock, 1000);
}/* Smart SIEM V2 dashboard. Load this as the replacement for the old dashboard
 * script; Chart.js, Globe.js, marked, and DOMPurify are optional existing UI
 * libraries. No bundler or additional package is required.
 */
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
  if (Array.isArray(overview?.countries) && Array.isArray(overview?.map_points)) {
    return { items: overview.countries, map_points: overview.map_points };
  }
  return requestJson(`${NODE2_API_BASE}/charts/geography?scope=all_model_output`);
}

async function fetchRecentEvents(overview = latestOverview) {
  if (Array.isArray(overview?.recent_events)) return overview.recent_events;
  // Only used if the optimized UI contract does not provide recent_events.
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

  // ดึงข้อมูลจำนวน row จาก API (attacks_today_log_rows, blocked_denied_log_rows)
  const metrics = [
    [overview.attacks_today, overview.attacks_today_log_rows, "source log rows"],
    [overview.blocked, overview.blocked_denied_log_rows, "denied log rows"],
    [overview.critical_active, null, "incidents meeting the UI triage threshold"],
  ];

  // อัปเดตตัวเลข KPI และข้อความกำกับด้านล่างแบบเรียลไทม์ (ข้อ ② และ ③)
  metrics.forEach(([value, supportingRows, unit], index) => {
    if (values[index]) values[index].textContent = numberText(value);
    if (subtexts[index]) {
      subtexts[index].textContent = supportingRows === null || supportingRows === undefined
        ? unit : `from ${numberText(supportingRows)} ${unit}`;
    }
  });

  // อัปเดตวันที่ Latest Data Day ด้านบน Header แบบเรียลไทม์ (ข้อ ①)
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
  attackVolumeChartInstance.update(); // Node 2 bucket labels are Asia/Bangkok time.
}

function renderThreatTypes(items) {
  if (!attackTypesChartInstance || !Array.isArray(items)) return;
  attackTypesChartInstance.data.labels = items.map((item) => item.threat_type || "ไม่ระบุประเภท");
  attackTypesChartInstance.data.datasets[0].data = items.map((item) => Number(item.count) || 0);
  attackTypesChartInstance.update();
  // Detector categories, including Data Exfiltration, do not prove success.
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

    // จุดวงกลมสี
    const swatch = document.createElement("span");
    swatch.className = "port-swatch";
    swatch.style.backgroundColor = colors[index];

    // ข้อความชื่อ Port (บรรทัดบน)
    const label = document.createElement("span");
    label.className = "port-label";
    label.textContent = `Port ${item.port ?? "—"}`;

    // ข้อความจำนวน signals (บรรทัดล่าง)
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
  //const note = document.createElement("div");
  //note.className = "country-note";
  // note.textContent = "ประเทศตามข้อมูลที่สังเกต ไม่ใช่ตำแหน่งผู้โจมตีที่ยืนยันแล้ว";
  //container.appendChild(note);
  const max = Math.max(0, ...items.map((item) => Number(item.detection_windows) || 0));
  //ถ้าประเทศมากกว่านี้ลบ.slice(0, 10)ออก
  items.slice(0, 10).forEach((item) => {
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
  // Node 2 currently returns map_points=[]: country strings and reserved IPs
  // cannot establish coordinates, so the globe rotates without attack arcs.
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

function relabelEventHeaders(table) {
    const headers = table?.querySelectorAll("thead th") || [];

    const labels = [
        "TIME (ICT)",
        "OBSERVED IP",
        "COUNTRY LABEL",
        "DESTINATION IP",
        "DETECTOR CATEGORY",
        "TRIAGE RISK",
        "DEST PORT",
        "OBSERVATION",
        "SENSORS"
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

        if (
            value === null ||
            value === undefined ||
            String(value).trim() === ""
        ) {
            return false;
        }

        const risk = Number(value);

        if (!Number.isFinite(risk)) return false;

        switch (currentRiskFilter) {
            case "80+":
                return risk >= 80;

            case "60-79":
                return risk >= 60 && risk < 80;

            case "<60":
                return risk < 60;

            default:
                return true;
        }
    });

    relabelEventHeaders(body.closest("table"));
    body.replaceChildren();

    const count = document.getElementById("event-count");

    if (count) {
        count.textContent =
            `${visibleEvents.length} of ${events.length} recent model signals`;
    }

    for (const event of visibleEvents) {
        const row = document.createElement("tr");
        let time = "—";

        if (event.time_bin) {
            const parsed = new Date(event.time_bin);

            if (!Number.isNaN(parsed.getTime())) {
                time = parsed.toLocaleTimeString("en-GB", {
                    timeZone: "Asia/Bangkok",
                    hour12: false
                });
            }
        }

        const sourceLabels =
            Array.isArray(event.sources_display) &&
            event.sources_display.length
                ? event.sources_display
                : Array.isArray(event.vendors_display)
                    ? event.vendors_display
                    : [];

        const cells = [
            time,
            event.observed_ip || "—",
            event.country || "—",
            event.primary_dst_ip || "—",
            event.threat_type || "—",
            numberText(event.calibrated_risk),
            event.primary_dst_port > 0
                ? String(event.primary_dst_port)
                : "—",
            Number(event.denied_count) > 0
                ? "Denied observed"
                : "Detected",
            sourceLabels.join(", ") || "—"
        ];

        cells.forEach((text, index) => {
            const cell = document.createElement("td");
            cell.textContent = text;

            if (index === 1) {
                cell.style.color = "#06b6d4";
            }

            if (index === 2) {
                cell.title =
                    `Country source: ${event.country_source || "Unknown"}`;
            }

            if (index === 5) {
                cell.title =
                    "Triage score; not compromise probability or validated severity.";
            }

            if (index === 8) {
                cell.title =
                    `Allowed: ${numberText(event.allowed_count)}; ` +
                    `Denied: ${numberText(event.denied_count)}; ` +
                    `Bytes out: ${numberText(event.bytes_out)}; ` +
                    `Bytes in: ${numberText(event.bytes_in)}; ` +
                    `Current detector stages: ${
                        (event.current_stage_names || []).join(", ") || "—"
                    }`;
            }

            row.appendChild(cell);
        });

        body.appendChild(row);
    }
}

function initFilters() {
    const buttons = document.querySelectorAll(
        ".table-header-filters .filter-btn"
    );

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
    // Keep the last successful screen rather than replacing it with zeros.
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
  // Normal UI always uses auto routing. Node 3 returns {response, meta}.
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
    } catch (_) { /* Storage may be disabled; chat still works. */ }
  }

  function renderMessage(text, sender, time = messageTime(), save = true) {
    const wrapper = document.createElement("div");
    wrapper.className = `message-wrapper ${sender === "user" ? "user" : "bot"}`;
    const content = document.createElement("div");
    content.className = "message-content";
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    // Only sanitized Markdown becomes HTML. Otherwise plain text is safe.
    if (sender === "bot" && window.marked?.parse && window.DOMPurify?.sanitize) {
      bubble.innerHTML = window.DOMPurify.sanitize(window.marked.parse(text));
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
      reportPath(job.report_id); // Validate the ID before polling or downloading.
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
      // Keep the link usable until this chat is cleared or the page is closed.
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
  void fetchAllData();
  window.setInterval(() => { void fetchAllData(); }, 30000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startSmartSiemUI, { once: true });
else startSmartSiemUI();