// อัปเดตนาฬิกา UTC มุมขวาบนทุกๆ 1 วินาที
function updateClock() {
    const clockElement = document.getElementById('utc-clock');
    if (!clockElement) return;
    const now = new Date();
    
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    
    clockElement.textContent = `${hours}:${minutes}:${seconds} UTC`;
}

setInterval(updateClock, 1000);
updateClock();