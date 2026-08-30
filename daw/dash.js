// อัปเดตนาฬิกา UTC มุมขวาบนทุกๆ 1 วินาที
function updateClock() {
    const clockElement = document.getElementById('utc-clock');
    const now = new Date();
    
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    
    clockElement.textContent = `${hours}:${minutes}:${seconds} UTC`;
}

setInterval(updateClock, 1000);
updateClock(); 

// --- สร้างกราฟ Bar (Top Talkers) สำหรับแถบ Right Sidebar ---
document.addEventListener("DOMContentLoaded", function() {
    Chart.defaults.color = '#6c84a3';
    Chart.defaults.font.family = "'Segoe UI', monospace";

    const ctx = document.getElementById('sourceChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['192.168.10.50', '192.168.10.55'],
            datasets: [{
                label: 'Connection Count',
                data: [4, 3],
                backgroundColor: '#f44336', // สีแดงแบบในรูปภาพเป๊ะๆ
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#6c84a3', boxWidth: 20 }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#1e2d4a' },
                    ticks: { color: '#6c84a3' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#a0b6d1' }
                }
            }
        }
    });
});