// ==========================================
// การตั้งค่า API ใหม่ (172.25.100.58)
// ==========================================
const API_BASE = "http://172.25.100.10:8000/api";

let attackTypesChartInstance;
let attackVolumeChartInstance;
let allAlertsData = []; 

// ฐานข้อมูลพิกัดประเทศสำหรับปักหมุดแผนที่
const COUNTRY_COORDINATES = {
    'US': { x: 20, y: 50 }, 'USA': { x: 20, y: 50 }, 'UNITED STATES': { x: 20, y: 50 },
    'TH': { x: 68, y: 68 }, 'THAILAND': { x: 68, y: 68 }, 'THAI1': { x: 68, y: 68 },
    'RU': { x: 62, y: 35 }, 'RUSSIA': { x: 62, y: 35 }, 'RESER...': { x: 62, y: 35 }, 'RESERVED': { x: 62, y: 35 },
    'CN': { x: 72, y: 48 }, 'CHINA': { x: 72, y: 48 },
    'SG': { x: 67, y: 72 }, 'SINGAPORE': { x: 67, y: 72 },
    'NL': { x: 38, y: 38 }, 'NETHERLANDS': { x: 38, y: 38 },
    'DE': { x: 42, y: 40 }, 'GERMANY': { x: 42, y: 40 },
    'GB': { x: 35, y: 36 }, 'UK': { x: 35, y: 36 },
    'JP': { x: 80, y: 48 }, 'JAPAN': { x: 80, y: 48 },
    'KR': { x: 77, y: 48 }, 'KOREA': { x: 77, y: 48 },
    'IN': { x: 60, y: 60 }, 'INDIA': { x: 60, y: 60 },
    'IR': { x: 52, y: 45 }, 'IRAN': { x: 52, y: 45 }
};

document.addEventListener("DOMContentLoaded", () => {
    initCharts();
    initFilters();
    initRealTimeClock();
    
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
            // ดึงยอดรวม Alert: totals.alerts
            const totalAlerts = data?.totals?.alerts || data?.total || 0;
            // ดึงยอด Critical Active: incidents.needs_llm
            const criticalActive = data?.incidents?.needs_llm || data?.needs_llm || 0;
            // ยอด Blocked (ดึงจาก stats หรือคำนวณจาก alerts)
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
// 2. API: GET /api/charts/timeline?bucket=hour&days=1
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
// 3. API: GET /api/charts/top-sources
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
            
        renderTopCountriesAndMap(sortedCountries);
    } catch (error) { console.error("Error fetching top sources:", error); }
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
// 6. API: GET /api/alerts?limit=12
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


/* =========================================================================
   การเรนเดอร์หน้าเว็บ (ตาราง, แผนที่, กราฟ, นาฬิกา)
   ========================================================================= */

function renderTopCountriesAndMap(countriesData) {
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

    updateGlobalThreatMap(countriesData);
}

function updateGlobalThreatMap(topCountries) {
    const nodesContainer = document.getElementById('nodes-container');
    const attackLinesSvg = document.getElementById('attack-lines');
    if (!nodesContainer || !attackLinesSvg) return;

    nodesContainer.innerHTML = '';
    attackLinesSvg.innerHTML = '';

    const targetNode = { name: 'IN TARGET', x: 55, y: 65, color: 'cyan' };
    const fallbackCoords = [{ x: 22, y: 55 }, { x: 38, y: 40 }, { x: 62, y: 35 }, { x: 72, y: 48 }, { x: 42, y: 75 }];

    drawMapNode(nodesContainer, targetNode.name, targetNode.x, targetNode.y, 'cyan', true);

    topCountries.forEach((item, index) => {
        const nameRaw = String(item.name || '').toUpperCase();
        
        let coords = COUNTRY_COORDINATES[nameRaw];
        if (!coords) {
            const matchedKey = Object.keys(COUNTRY_COORDINATES).find(k => nameRaw.includes(k) || k.includes(nameRaw));
            coords = matchedKey ? COUNTRY_COORDINATES[matchedKey] : fallbackCoords[index % fallbackCoords.length];
        }

        const nodeColor = index === 0 ? 'red' : (index < 3 ? 'orange' : 'blue');
        const shortName = nameRaw.substring(0, 7);

        drawMapNode(nodesContainer, shortName, coords.x, coords.y, nodeColor, false);
        drawAttackLine(attackLinesSvg, coords.x, coords.y, targetNode.x, targetNode.y, nodeColor);
    });
}

function drawMapNode(container, name, x, y, colorClass, isTarget) {
    const nodeGroup = document.createElement('div');
    nodeGroup.className = `node-group ${colorClass}`;
    nodeGroup.style.left = `${x}%`;
    nodeGroup.style.top = `${y}%`;

    const node = document.createElement('div');
    node.className = 'node pulse';

    const label = document.createElement('span');
    label.className = `country-label ${isTarget ? 'target-label' : ''}`;
    label.textContent = name;

    nodeGroup.appendChild(node);
    nodeGroup.appendChild(label);
    container.appendChild(nodeGroup);
}

function drawAttackLine(svgContainer, x1, y1, x2, y2, colorClass) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', `attack-line`);
    line.setAttribute('x1', `${x1}%`);
    line.setAttribute('y1', `${y1}%`);
    line.setAttribute('x2', `${x2}%`);
    line.setAttribute('y2', `${y2}%`);

    let strokeColor = '#f97316'; 
    if (colorClass === 'red') strokeColor = '#ef4444';
    if (colorClass === 'cyan' || colorClass === 'blue') strokeColor = '#06b6d4';

    line.style.stroke = strokeColor;
    svgContainer.appendChild(line);
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
            ctx.font = "bold 14px 'Segoe UI', sans-serif";
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
                responsive: true, maintainAspectRatio: false, layout: { padding: 0 },
                plugins: { legend: { position: 'right', labels: { color: '#e2e8f0', usePointStyle: true, pointStyle: 'circle', boxWidth: 6, font: { family: 'monospace', size: 10 }, padding: 6 } } },
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
}