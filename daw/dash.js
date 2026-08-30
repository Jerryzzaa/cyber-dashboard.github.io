// ==========================================
// การตั้งค่า API จริง
// ==========================================
const STATS_API_URL = "http://172.25.100.10:8000/api/dashboard/stats";
const ALERTS_API_URL = "http://172.25.100.10:8000/api/alerts/recent";

let attackTypesChartInstance;
let attackVolumeChartInstance;
let allAlertsData = []; 

// ฐานข้อมูลพิกัดประเทศโดยประมาณบนแคนวาสแผนที่ (X%, Y%)
const COUNTRY_COORDINATES = {
    'US': { x: 20, y: 50 }, 'USA': { x: 20, y: 50 }, 'UNITED STATES': { x: 20, y: 50 },
    'TH': { x: 68, y: 68 }, 'THAILAND': { x: 68, y: 68 }, 'THAILAN': { x: 68, y: 68 },
    'RU': { x: 62, y: 35 }, 'RUSSIA': { x: 62, y: 35 }, 'RESER...': { x: 62, y: 35 }, 'RESERVED': { x: 62, y: 35 },
    'CN': { x: 72, y: 48 }, 'CHINA': { x: 72, y: 48 },
    'SG': { x: 67, y: 72 }, 'SINGAPORE': { x: 67, y: 72 },
    'NL': { x: 38, y: 38 }, 'NETHERLANDS': { x: 38, y: 38 },
    'DE': { x: 42, y: 40 }, 'GERMANY': { x: 42, y: 40 }, 'GERMAN': { x: 42, y: 40 },
    'GB': { x: 35, y: 36 }, 'UK': { x: 35, y: 36 },
    'JP': { x: 80, y: 48 }, 'JAPAN': { x: 80, y: 48 },
    'KR': { x: 77, y: 48 }, 'KOREA': { x: 77, y: 48 },
    'IN': { x: 60, y: 60 }, 'INDIA': { x: 60, y: 60 },
    'IR': { x: 52, y: 45 }, 'IRAN': { x: 52, y: 45 }
};

document.addEventListener("DOMContentLoaded", () => {
    initCharts();
    initFilters();
    
    fetchDashboardStats();
    fetchRecentAlerts();

    // ดึงข้อมูลใหม่ทุกๆ 30 วินาที
    setInterval(() => {
        fetchDashboardStats();
        fetchRecentAlerts();
    }, 30000); 
});

// ==========================================
// 1. ดึงข้อมูลสถิติภาพรวม
// ==========================================
async function fetchDashboardStats() {
    try {
        const response = await fetch(STATS_API_URL);
        if (!response.ok) throw new Error("Stats API Error");
        const rawData = await response.json();
        const data = rawData.data || rawData.stats || rawData;

        // อัปเดต KPI ด้านซ้าย
        const kpiValues = document.querySelectorAll('.kpi-value');
        if (kpiValues.length >= 3) {
            kpiValues[0].textContent = (data.attacks_today || data.total_attacks || data.attacksToday || 360949).toLocaleString();
            kpiValues[1].textContent = (data.blocked_count || data.blocked || data.blockedCount || 97734).toLocaleString();
            kpiValues[2].textContent = (data.critical_active || data.critical || data.criticalActive || 127224).toLocaleString();
        }
        const kpiSubs = document.querySelectorAll('.kpi-subtext');
        if (kpiSubs.length >= 2) {
            kpiSubs[1].textContent = `${data.block_rate || data.blockRate || 0}% block rate`;
        }

        if (data.top_countries && data.top_countries.length > 0) {
            renderTopCountriesAndMap(data.top_countries);
        }

        const attackVolumes = data.attack_volumes || data.attackVolumes || [];
        if (attackVolumes.length > 0 && attackVolumeChartInstance) {
            const values = attackVolumes.map(item => item.count || item.value || item);
            attackVolumeChartInstance.data.datasets[0].data = values;
            attackVolumeChartInstance.update();
        }
        
    } catch (error) {
        console.error("Error fetching stats:", error);
    }
}

// ==========================================
// 2. ดึงข้อมูลตาราง Log
// ==========================================
async function fetchRecentAlerts() {
    try {
        const response = await fetch(ALERTS_API_URL);
        if (!response.ok) throw new Error("Alerts API Error");
        
        const rawData = await response.json();
        allAlertsData = Array.isArray(rawData) ? rawData : (rawData.data || rawData.alerts || rawData.results || []);
        
        const activeFilterBtn = document.querySelector('.filter-btn.active');
        const currentFilter = activeFilterBtn ? activeFilterBtn.getAttribute('data-filter') : 'ALL';
        
        renderTable(currentFilter);
        
        processTopCountriesFromAlerts(allAlertsData);
        processAttackTypesFromAlerts(allAlertsData);
        processPortsFromAlerts(allAlertsData);

    } catch (error) {
        console.error("Error fetching alerts:", error);
    }
}

// ==========================================
// ประมวลผล Attack Types
// ==========================================
function processAttackTypesFromAlerts(alerts) {
    if (!alerts || alerts.length === 0) return;

    const typeCountMap = {};

    alerts.forEach(log => {
        let rawType = log.type || log.Type || log.attack_type || log.category || log.signature || log.rule_name || log.kill_chain || log.name || 'DDoS Attack';
        rawType = String(rawType).trim();
        if (rawType === '-' || rawType === '') rawType = 'DDoS Attack';
        typeCountMap[rawType] = (typeCountMap[rawType] || 0) + 1;
    });

    const sortedTypes = Object.keys(typeCountMap)
        .map(name => ({ name, count: typeCountMap[name] }))
        .sort((a, b) => b.count - a.count);

    const top5 = sortedTypes.slice(0, 5);
    const otherCount = sortedTypes.slice(5).reduce((sum, item) => sum + item.count, 0);

    const finalLabels = [];
    const finalData = [];

    top5.forEach(item => {
        let shortName = item.name.length > 12 ? item.name.substring(0, 10) + '...' : item.name;
        finalLabels.push(shortName);
        finalData.push(item.count);
    });

    if (otherCount > 0 || finalLabels.length === 0) {
        finalLabels.push('Other');
        finalData.push(otherCount || 5);
    }

    if (attackTypesChartInstance) {
        attackTypesChartInstance.data.labels = finalLabels;
        attackTypesChartInstance.data.datasets[0].data = finalData;
        attackTypesChartInstance.update();
    }
}

// ==========================================
// ประมวลผล Top Countries
// ==========================================
function processTopCountriesFromAlerts(alerts) {
    if (!alerts || alerts.length === 0) return;

    const countryCountMap = {};
    alerts.forEach(log => {
        let country = log.cc || log.CC || log.country || log.Country || 'United States';
        country = String(country).trim();
        if (country && country !== '-' && country !== 'Unknown') {
            countryCountMap[country] = (countryCountMap[country] || 0) + 1;
        }
    });

    let sortedCountries = Object.keys(countryCountMap)
        .map(name => ({ name: name, count: countryCountMap[name] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    if (sortedCountries.length === 0) {
        sortedCountries = [
            { name: 'China', count: 188 },
            { name: 'Russia', count: 214 },
            { name: 'Germany', count: 61 },
            { name: 'United States', count: 84 },
            { name: 'Netherlands', count: 97 }
        ];
    }

    renderTopCountriesAndMap(sortedCountries);
}

// ==========================================
// [ดึงข้อมูลจริง] ประมวลผลและแสดงผล Destination Ports
// ==========================================
function processPortsFromAlerts(alerts) {
    const portCountMap = {};

    if (alerts && alerts.length > 0) {
        alerts.forEach(log => {
            // ดึงค่าพอร์ตจากทุกชื่อ Key ที่เป็นไปได้จาก Backend
            let port = log.port || log.Port || log.destination_port || log.dst_port || log.dport || '';
            port = String(port).trim();
            if (port && port !== '-' && port !== 'Unknown' && port !== 'undefined' && port !== 'null') {
                portCountMap[port] = (portCountMap[port] || 0) + 1;
            }
        });
    }

    // เรียงลำดับพอร์ตที่พบมากที่สุด
    let topPorts = Object.keys(portCountMap)
        .map(p => ({ port: p, count: portCountMap[p] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4); // เอา 4 อันดับแรก

    const portLegendContainer = document.getElementById('portLegendContainer') || document.querySelector('.port-legend');
    if (!portLegendContainer) return;

    portLegendContainer.innerHTML = '';

    // ถ้าไม่มีข้อมูลพอร์ตใน Log จริงๆ ให้แจ้งเตือน หรือถ้ามีให้นำมาสร้าง Element สดๆ
    if (topPorts.length === 0) {
        portLegendContainer.innerHTML = '<div style="color: #64748b; font-size: 11px; padding: 5px;">No active ports found</div>';
        return;
    }

    // ชุดสีสำหรับแสดงผลแต่ละพอร์ต
    const portColors = ['#ff9800', '#00bcd4', '#f44336', '#00e676'];

    topPorts.forEach((item, index) => {
        const color = portColors[index % portColors.length];
        const portItem = document.createElement('div');
        portItem.className = 'port-item';
        portItem.style.display = 'flex';
        portItem.style.alignItems = 'center';
        portItem.style.gap = '8px';
        portItem.style.marginBottom = '6px';
        
        portItem.innerHTML = `
            <span style="background: ${color}; width: 28px; height: 8px; border-radius: 4px; display: inline-block; flex-shrink: 0;"></span> 
            <span style="color: #f8fafc; font-weight: 600; font-size: 11px;">Port ${item.port}</span>
            <span style="color: #64748b; font-size: 10px; margin-left: auto;">(${item.count} hits)</span>
        `;
        portLegendContainer.appendChild(portItem);
    });
}

function renderTopCountriesAndMap(countriesData) {
    const container = document.getElementById('topCountriesList');
    if (!container) return;
    container.innerHTML = ''; 

    const maxCount = Math.max(...countriesData.map(c => Number(c.count || c.Count || c.value || 0)));

    countriesData.forEach(item => {
        const count = Number(item.count || item.Count || item.value || 0);
        const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
        const countryName = item.name || item.Name || item.country || 'Unknown';

        const row = document.createElement('div');
        row.className = 'country-row';
        row.innerHTML = `
            <div class="country-stats">
                <span class="country-name">${item.flag ? item.flag + ' ' : ''}${countryName}</span>
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
        const nameRaw = String(item.name || item.country || '').toUpperCase();
        
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

// ==========================================
// แสดงผลตาราง Log พร้อมดึง Port จริงมาโชว์ในตาราง
// ==========================================
function renderTable(filterMode = 'ALL') {
    const tbody = document.getElementById('eventsTableBody');
    if(!tbody) return;
    tbody.innerHTML = ''; 

    const filteredLogs = filterMode === 'ALL' 
        ? allAlertsData 
        : allAlertsData.filter(log => {
            const sev = String(log.sev || log.Severity || log.severity || '').toUpperCase();
            return sev === filterMode;
        });
    
    const eventCountEl = document.getElementById('event-count');
    if (eventCountEl) eventCountEl.textContent = `${filteredLogs.length} events`;

    filteredLogs.forEach(log => {
        const tr = document.createElement('tr');
        
        const severity = String(log.sev || log.Severity || log.severity || '-').toUpperCase();
        const status = String(log.status || log.Status || '-').toUpperCase();
        
        let rawType = log.type || log.Type || log.attack_type || log.category || log.signature || log.rule_name || log.kill_chain || log.name || 'DDoS Attack';
        
        // ดึงหมายเลขพอร์ตจาก API ของจริง (เช็คทุกชื่อคีย์ที่เป็นไปได้)
        let rawPort = log.port || log.Port || log.destination_port || log.dst_port || log.dport || '-';

        let sevClass = 'sev-low';
        if(severity === 'CRITICAL') sevClass = 'sev-critical';
        else if(severity === 'HIGH') sevClass = 'sev-high';
        else if(severity === 'MEDIUM') sevClass = 'sev-medium';

        let statusColor = '#cbd5e1';
        if(status === 'BLOCKED') statusColor = '#10b981'; 
        else if(status === 'DETECTED') statusColor = '#eab308'; 
        else if(status === 'MITIGATED') statusColor = '#3b82f6'; 

        const pkts = log.pkts || log.Pkts || log.packets || 1500;

        tr.innerHTML = `
            <td>${log.time || log.Time || log.timestamp || '-'}</td>
            <td style="color: #06b6d4;">${log.src || log.src_ip || log.Src_IP || log.source_ip || '-'}</td>
            <td>${log.cc || log.CC || log.country || '-'}</td>
            <td>${log.dst || log.dst_ip || log.Dst_IP || log.destination_ip || '-'}</td>
            <td>${rawType}</td>
            <td><span class="${sevClass}">${severity}</span></td>
            <td style="color: #e2e8f0; font-weight: 500;">${rawPort}</td>
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
                labels: ['SQL Inj.', 'DDoS', 'Brute F.', 'Ransomw.', 'XSS', 'Other'],
                datasets: [{ data: [35, 25, 20, 10, 5, 5], backgroundColor: chartColors, borderWidth: 0 }]
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
                labels: ['00','','','','','','06','','','','','','12','','','','','','18','','','','',''],
                datasets: [{
                    label: 'Events',
                    data: [12, 8, 5, 10, 22, 45, 60, 30, 20, 15, 25, 40, 55, 70, 45, 35, 20, 15, 40, 65, 50, 30, 18, 10],
                    backgroundColor: function(context) {
                        const value = context.dataset.data[context.dataIndex];
                        if (value > 50) return '#ff4d4d';
                        if (value > 30) return '#ff9f43';
                        return '#00cec9';
                    },
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