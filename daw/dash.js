// ==========================================
// การตั้งค่า API สำหรับเชื่อมต่อกับข้อมูลของเพื่อน
// ==========================================
const API_KEY = "ใส่_API_KEY_ของเพื่อนที่นี่"; // <--- รอเอา Key จากเพื่อนมาใส่ตรงนี้
const API_URL = "https://api.yourfriends-server.com/v1/dashboard-data"; // <--- เปลี่ยนเป็น URL จริงของเพื่อน

// ตัวแปรเก็บกราฟเพื่อเอาไว้อัปเดตข้อมูลทีหลังได้
let attackTypesChartInstance;
let attackVolumeChartInstance;

// ฟังก์ชันหลักที่เริ่มทำงานเมื่อโหลดหน้าเว็บ
document.addEventListener("DOMContentLoaded", () => {
    // 1. วาดกราฟด้วยข้อมูลจำลองไปก่อน (เพื่อโครงสร้าง UI)
    initCharts();
    populateMockTable('ALL');
    initMap();
    initFilters();
    renderTopCountries(mockTopCountries);
    // 2. เรียกฟังก์ชันดึงข้อมูลจริงจากเพื่อน
    // fetchDataFromFriendAPI(); // <--- เปิดคอมเมนต์บรรทัดนี้เมื่อ API เพื่อนพร้อม
});

// ==========================================
// ฟังก์ชันดึงข้อมูลจาก API
// ==========================================
async function fetchDataFromFriendAPI() {
    try {
        const response = await fetch(API_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error("Network response was not ok");

        const data = await response.json();
        
        // เมื่อได้ข้อมูลมาแล้ว ให้อัปเดตกราฟ
        updateCharts(data);
        
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

// ==========================================
// ส่วนของการวาดกราฟ (Chart.js)
// ==========================================
// ==========================================
// ส่วนของการวาดกราฟ (Chart.js)
// ==========================================
function initCharts() {
    // สีที่ปรับใหม่ให้เหมือนรูปต้นฉบับมากขึ้น
    const chartColors = ['#ff4d4d', '#ff9f43', '#00cec9', '#a29bfe', '#2ed573', '#747d8c'];

    // ปลั๊กอินเสริมสำหรับเขียนข้อความ "Total 510" ตรงกลางโดนัท
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

            // วาดคำว่า "Total"
            ctx.font = "12px 'Segoe UI', sans-serif";
            ctx.fillStyle = "#64748b";
            ctx.fillText("Total", centerX, centerY - 10);

            // วาดตัวเลข "510"
            ctx.font = "bold 20px 'Segoe UI', sans-serif";
            ctx.fillStyle = "#ffffff";
            ctx.fillText("510", centerX, centerY + 12);
            ctx.restore();
        }
    };

    // 1. กราฟโดนัท (Attack Types)
    const ctxDoughnut = document.getElementById('attackTypeChart').getContext('2d');
    attackTypesChartInstance = new Chart(ctxDoughnut, {
        type: 'doughnut',
        data: {
            labels: [
                'SQL Inj...   28%', 
                'DDoS         19%', 
                'Brute F...   17%', 
                'Ransomw...   13%', 
                'XSS          10%', 
                'Other        13%'
            ],
            datasets: [{
                data: [28, 19, 17, 13, 10, 13], 
                backgroundColor: chartColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: 10
            },
            plugins: {
                legend: { 
                    position: 'right', 
                    labels: { 
                        color: '#e2e8f0', 
                        usePointStyle: true, 
                        pointStyle: 'circle', 
                        font: {
                            family: 'monospace', 
                            size: 12
                        },
                        padding: 15
                    } 
                }
            },
            cutout: '70%'
        },
        plugins: [centerTextPlugin]
    });

    // 2. กราฟแท่ง (Attack Volume - 24H)
    const ctxBar = document.getElementById('attackVolumeChart').getContext('2d');
    attackVolumeChartInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
            // สร้าง Label 24 ช่อง โดยแสดงตัวเลขแค่ตำแหน่ง 00, 06, 12, 18
            labels: [
                '00', '', '', '', '', '', 
                '06', '', '', '', '', '', 
                '12', '', '', '', '', '', 
                '18', '', '', '', '', ''
            ],
            datasets: [{
                label: 'Events',
                // ใส่ข้อมูลจำลอง 24 ค่า (รอเปลี่ยนเป็นข้อมูลจาก API เพื่อน)
                data: [15, 10, 8, 12, 5, 20, 35, 40, 25, 45, 60, 50, 75, 55, 30, 25, 30, 45, 50, 65, 80, 40, 20, 15],
                backgroundColor: function(context) {
                    const value = context.dataset.data[context.dataIndex];
                    if (value > 50) return '#ff4d4d'; // สีแดง (ค่า > 50)
                    if (value > 30) return '#ff9f43'; // สีส้ม (ค่า > 30)
                    return '#00cec9'; // สีฟ้า (ค่า <= 30)
                },
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { display: false }, // ซ่อนแกน Y
                x: { 
                    grid: { display: false }, 
                    ticks: { color: '#64748b' } 
                }
            }
        }
    });
}

// ฟังก์ชันสำหรับรับข้อมูลจาก API มาอัปเดตกราฟใหม่
function updateCharts(apiData) {
    // สมมติว่า apiData มีโครงสร้าง .attackTypes และ .attackVolumes
    // attackTypesChartInstance.data.datasets[0].data = apiData.attackTypes;
    // attackTypesChartInstance.update();
    
    // attackVolumeChartInstance.data.datasets[0].data = apiData.attackVolumes;
    // attackVolumeChartInstance.update();
}

// ฟังก์ชันสร้างข้อมูลจำลองสำหรับตาราง Log ด้านล่าง
// ข้อมูลจำลองทั้งหมด 12 แถว
const mockLogs = [
    { time: '14:32:01', src: '185.220.101.47', cc: 'RU', dst: '10.0.1.15', type: 'SQL Injection', sev: 'CRITICAL', port: '3306', status: 'BLOCKED', pkts: '2,841' },
    { time: '14:31:58', src: '103.75.190.22', cc: 'CN', dst: '10.0.2.88', type: 'Brute Force SSH', sev: 'HIGH', port: '22', status: 'DETECTED', pkts: '18,432' },
    { time: '14:31:44', src: '45.142.212.100', cc: 'NL', dst: '10.0.0.1', type: 'DDoS UDP Flood', sev: 'CRITICAL', port: '53', status: 'MITIGATED', pkts: '412,890' },
    { time: '14:31:33', src: '91.108.4.11', cc: 'DE', dst: '10.0.3.22', type: 'XSS Reflected', sev: 'MEDIUM', port: '443', status: 'BLOCKED', pkts: '127' },
    { time: '14:31:21', src: '198.98.51.189', cc: 'US', dst: '10.0.1.99', type: 'RFI Attack', sev: 'HIGH', port: '80', status: 'BLOCKED', pkts: '344' },
    { time: '14:31:09', src: '5.188.206.14', cc: 'RU', dst: '10.0.4.5', type: 'Port Scan', sev: 'LOW', port: '-', status: 'DETECTED', pkts: '65,536' },
    { time: '14:30:58', src: '192.42.116.16', cc: 'SE', dst: '10.0.2.11', type: 'Ransomware C2', sev: 'CRITICAL', port: '8080', status: 'BLOCKED', pkts: '892' },
    { time: '14:30:47', src: '178.128.48.201', cc: 'SG', dst: '10.0.1.30', type: 'LDAP Injection', sev: 'MEDIUM', port: '389', status: 'MITIGATED', pkts: '214' },
    { time: '14:30:35', src: '89.248.167.131', cc: 'NL', dst: '10.0.0.254', type: 'CVE-2024-3400', sev: 'CRITICAL', port: '443', status: 'BLOCKED', pkts: '1,205' },
    { time: '14:30:22', src: '117.239.41.66', cc: 'IN', dst: '10.0.3.77', type: 'Credential Stuffing', sev: 'HIGH', port: '443', status: 'DETECTED', pkts: '7,231' },
    { time: '14:30:10', src: '62.102.148.68', cc: 'TR', dst: '10.0.2.45', type: 'Log4Shell', sev: 'CRITICAL', port: '8443', status: 'BLOCKED', pkts: '432' },
    { time: '14:29:55', src: '23.92.19.27', cc: 'US', dst: '10.0.1.8', type: 'MITM ARP Spoof', sev: 'HIGH', port: '-', status: 'MITIGATED', pkts: '88,123' }
];

// ฟังก์ชันสร้างตารางและกรองข้อมูล
function populateMockTable(filterMode = 'ALL') {
    const tbody = document.getElementById('eventsTableBody');
    tbody.innerHTML = ''; // ล้างข้อมูลเก่าออกก่อน

    // กรองข้อมูลตามที่กดเลือก
    const filteredLogs = filterMode === 'ALL' ? mockLogs : mockLogs.filter(log => log.sev === filterMode);
    
    // อัปเดตจำนวน Event ด้านขวาบน
    document.getElementById('event-count').textContent = `${filteredLogs.length} events`;

    filteredLogs.forEach(log => {
        const tr = document.createElement('tr');
        
        let sevClass = '';
        if(log.sev === 'CRITICAL') sevClass = 'sev-critical';
        else if(log.sev === 'HIGH') sevClass = 'sev-high';
        else if(log.sev === 'MEDIUM') sevClass = 'sev-medium';
        else if(log.sev === 'LOW') sevClass = 'sev-low';

        let statusColor = '';
        if(log.status === 'BLOCKED') statusColor = '#10b981'; // เขียว
        else if(log.status === 'DETECTED') statusColor = '#eab308'; // เหลือง
        else if(log.status === 'MITIGATED') statusColor = '#3b82f6'; // น้ำเงิน

        tr.innerHTML = `
            <td>${log.time}</td>
            <td style="color: #06b6d4;">${log.src}</td>
            <td>${log.cc}</td>
            <td>${log.dst}</td>
            <td>${log.type}</td>
            <td><span class="${sevClass}">${log.sev}</span></td>
            <td>${log.port}</td>
            <td style="color: ${statusColor}; font-weight: bold;">${log.status}</td>
            <td style="text-align: right; color: #64748b;">${log.pkts}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ฟังก์ชันเพิ่ม Event ให้กับปุ่ม Filter
function initFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // ลบคลาส active ออกจากทุกปุ่ม
            filterBtns.forEach(b => b.classList.remove('active'));
            // ใส่คลาส active ให้ปุ่มที่เพิ่งถูกกด
            e.target.classList.add('active');
            
            // ดึงค่าว่าปุ่มนี้คือ ALL, CRITICAL ฯลฯ แล้วเรียกฟังก์ชันวาดตารางใหม่
            const filterValue = e.target.getAttribute('data-filter');
            populateMockTable(filterValue);
        });
    });
}
// ==========================================
// ส่วนของการสร้างแผนที่และแอนิเมชัน (Map Visualization)
// ==========================================
function initMap() {
    const nodesContainer = document.getElementById('nodes-container');
    const attackLinesSvg = document.getElementById('attack-lines');
    
    // ตรวจสอบว่ามี element แผนที่อยู่จริงหรือไม่
    if (!nodesContainer || !attackLinesSvg) return;
    
    // ข้อมูลประเทศและพิกัด (โดยประมาณ)
    const countries = [
        { name: 'US', x: 10, y: 50, color: 'orange', type: 'source' },
        { name: 'SG', x: 50, y: 70, color: 'orange', type: 'source' },
        { name: 'IN', x: 65, y: 60, color: 'cyan', type: 'target' },
        { name: 'TR', x: 55, y: 40, color: 'blue', type: 'source' },
        { name: 'NL', x: 42, y: 35, color: 'orange', type: 'source' },
        { name: 'DE', x: 45, y: 35, color: 'orange', type: 'source' },
        { name: 'SE', x: 43, y: 30, color: 'orange', type: 'source' },
        { name: 'RU', x: 70, y: 35, color: 'red', type: 'source' },
        { name: 'CN', x: 80, y: 35, color: 'red', type: 'source' }
    ];

    // สร้างโหนดและป้ายชื่อประเทศ
    countries.forEach(country => {
        const nodeGroup = document.createElement('div');
        nodeGroup.className = `node-group ${country.color}`;
        nodeGroup.style.left = `${country.x}%`;
        nodeGroup.style.top = `${country.y}%`;
        
        const node = document.createElement('div');
        node.className = 'node pulse';
        
        const label = document.createElement('span');
        label.className = `country-label ${country.type === 'target' ? 'target-label' : ''}`;
        label.textContent = country.name + (country.type === 'target' ? ' TARGET' : '');
        
        nodeGroup.appendChild(node);
        nodeGroup.appendChild(label);
        nodesContainer.appendChild(nodeGroup);
    });

    // ค้นหาโหนดเป้าหมาย (IN)
    const targetNode = countries.find(c => c.type === 'target');

    // สร้างเส้นการโจมตี (SVG Line)
    countries.forEach(country => {
        if (country.type === 'source') {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('class', `attack-line`);
            line.setAttribute('x1', `${country.x}%`);
            line.setAttribute('y1', `${country.y}%`);
            line.setAttribute('x2', `${targetNode.x}%`);
            line.setAttribute('y2', `${targetNode.y}%`);
            
            // กำหนดสีเส้นตามประเภท
            line.style.stroke = country.color === 'orange' ? '#f97316' : 
                               (country.color === 'blue' ? '#06b6d4' : '#ef4444');
                               
            attackLinesSvg.appendChild(line);
        }
    });
}

// 1. ข้อมูลจำลอง (Mock Data) ใช้แสดงผลก่อนระหว่างรอ API จากเพื่อน
const mockTopCountries = [
    { name: 'Russia', flag: '🇷🇺', count: 214 },
    { name: 'China', flag: '🇨🇳', count: 188 },
    { name: 'Netherlands', flag: '🇳🇱', count: 97 },
    { name: 'United States', flag: '🇺🇸', count: 84 },
    { name: 'Germany', flag: '🇩🇪', count: 61 }
];

// 2. ฟังก์ชันวาดรายการประเทศแบบ Dynamic (คำนวณความยาวแท่งกราฟให้อัตโนมัติ)
function renderTopCountries(countriesData) {
    const container = document.getElementById('topCountriesList');
    if (!container) return;
    
    container.innerHTML = ''; // ล้างข้อมูลเก่าก่อนวาดใหม่

    if (!countriesData || countriesData.length === 0) {
        container.innerHTML = '<div style="color: #64748b; font-size: 12px;">No country data</div>';
        return;
    }

    // หาค่าจำนวนการโจมตีที่มากที่สุดใน Array เพื่อนำมาคิดเป็น 100% ความยาวแท่ง
    const maxCount = Math.max(...countriesData.map(c => c.count));

    countriesData.forEach(item => {
        // คำนวณเปอร์เซ็นต์ความกว้างของแท่งสีแดงเทียบกับประเทศอันดับ 1
        const percentage = maxCount > 0 ? (item.count / maxCount) * 100 : 0;

        const row = document.createElement('div');
        row.className = 'country-row';
        row.innerHTML = `
            <div class="country-stats">
                <span class="country-name">${item.flag ? item.flag + ' ' : ''}${item.name}</span>
                <span class="country-count">${item.count.toLocaleString()}</span>
            </div>
            <div class="country-bar">
                <div class="bar-fill" style="width: ${percentage}%;"></div>
            </div>
        `;
        container.appendChild(row);
    });
}