/* // ==========================================
// การตั้งค่า API (อัปเดตเป็น IP/Port ใหม่)
// ==========================================
const API_BASE = "http://172.24.5.36:8000/api";

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

// Smart SIEM V2 browser adapter 
(function (global) {
  "use strict";

  const config = global.SMART_SIEM_CONFIG || {};
  const VM_VPN_HOST = String(config.VM_VPN_HOST || global.VM_VPN_HOST || "172.24.5.36").trim();
  const NODE2_API_BASE = String(config.NODE2_API_BASE || `http://${VM_VPN_HOST}:8000/api`).replace(/\/+$/, "");
  const NODE3_AI_BASE = String(config.NODE3_AI_BASE || `http://${VM_VPN_HOST}:8001/api/ai`).replace(/\/+$/, "");
  let overviewPromise = null;

  function requireConfiguration() {
    if (NODE3_AI_BASE.includes("<VM_VPN_HOST>")) {
      throw new Error("Set SMART_SIEM_CONFIG.VM_VPN_HOST before loading ui_api_adapter.js");
    }
  }

  async function requestJson(base, path, options) {
    requireConfiguration();
    const response = await global.fetch(base + path, {
      credentials: "omit",
      ...options,
    });
    if (!response.ok) {
      throw new Error(`Smart SIEM API returned HTTP ${response.status}`);
    }
    try {
      return await response.json();
    } catch (_) {
      throw new Error("Smart SIEM API returned invalid JSON");
    }
  }

  function fetchDashboardOverview(refresh = false) {
    if (refresh || !overviewPromise) {
      overviewPromise = requestJson(NODE2_API_BASE, "/ui/overview?scope=all_model_output")
        .catch((error) => { overviewPromise = null; throw error; });
    }
    return overviewPromise;
  }

  async function fetchTimeline() {
    const overview = await fetchDashboardOverview();
    return overview.timeline_24h || []; 
  }

  function fetchThreatTypes() {
    return requestJson(NODE2_API_BASE, "/charts/threat-types?scope=all_model_output");
  }

  function fetchTopPorts() {
    return requestJson(NODE2_API_BASE, "/charts/top-ports?scope=all_model_output");
  }

  function fetchGeography() {
    return requestJson(NODE2_API_BASE, "/charts/geography?scope=all_model_output");
  }

  async function fetchRecentEvents() {
    const overview = await fetchDashboardOverview();
    return overview.recent_events || []; 
  }

  function postNode3(path, body) {
    return requestJson(NODE3_AI_BASE, path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function askAI(message) {
    return postNode3("/chat", { message, audience: "auto", scope: "all_model_output" });
  }

  function createExecutiveReport(message, title) {
    return postNode3("/reports", { message, audience: "auto", scope: "all_model_output", title });
  }

  function reportPath(reportId) {
    if (typeof reportId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(reportId)) {
      throw new Error("Invalid report ID");
    }
    return "/reports/" + encodeURIComponent(reportId);
  }

  function getReportStatus(reportId) {
    return requestJson(NODE3_AI_BASE, reportPath(reportId));
  }

  function getReportDownloadUrl(reportId) {
    requireConfiguration();
    return NODE3_AI_BASE + reportPath(reportId) + "/download";
  }

  global.SmartSiemAPI = Object.freeze({
    NODE2_API_BASE, NODE3_AI_BASE,
    fetchDashboardOverview, fetchTimeline, fetchThreatTypes, fetchTopPorts,
    fetchGeography, fetchRecentEvents, askAI, createExecutiveReport,
    getReportStatus, getReportDownloadUrl,
  });
})(window);

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

    if (expandBtn) {
        expandBtn.addEventListener('click', () => {
            if (modal) modal.style.display = 'block';
            if (!modalGlobe && modalContainer) {
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

            if (modalGlobe && modalContainer) {
                modalGlobe.width(modalContainer.clientWidth);
                modalGlobe.height(modalContainer.clientHeight);
                modalGlobe.arcsData(currentArcsData);
                modalGlobe.labelsData(currentLabelsData);
                modalGlobe.pointOfView({ lat: 20, lng: 80, altitude: 2.0 });
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });
    }
}

function update3DGlobeData(topCountries) {
    const arcs = [];
    const labels = [];

    const thData = topCountries.find(item => {
        const nameUpper = String(item.name || '').toUpperCase();
        return nameUpper === 'TH' || nameUpper === 'THAILAND';
    });
    const thCount = thData ? Number(thData.count || 0).toLocaleString() : 'Active';

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
} */