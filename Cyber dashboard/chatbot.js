function initChatbot() {
    const CHAT_API_URL = "http://172.25.100.6:10000/api/ai/chat";
    const inputField = document.getElementById('aiInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatHistory = document.getElementById('chatHistory');
    const tagButtons = document.querySelectorAll('.tag-btn');

    function scrollToBottom() {
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    function getCurrentTime() {
        const now = new Date();
        return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    async function appendUserMessage(text) {
        if (!text.trim()) return;

        const msgWrapper = document.createElement('div');
        msgWrapper.className = 'message-wrapper user';
        msgWrapper.innerHTML = `
            <div class="message-content">
                <div class="message-bubble">${text}</div>
                <div class="message-time">${getCurrentTime()}</div>
            </div>
        `;
        chatHistory.appendChild(msgWrapper);
        
        inputField.value = '';
        scrollToBottom();
        
        showTypingIndicator();
        
        try {
            // ส่งไปทั้ง message, prompt, query เผื่อ Backend ใช้ตัวไหนตัวหนึ่ง
            const response = await fetch(CHAT_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    message: text,
                    prompt: text,
                    query: text
                }) 
            });

            if (!response.ok) throw new Error("API Error");
            
            const rawData = await response.json();
            console.log("Chat API Response:", rawData); // ดูโครงสร้างแชทใน F12

            removeTypingIndicator();
            
            // ดักจับคำตอบครอบคลุมทุกรูปแบบ
            let aiResponseText = rawData.reply || rawData.message || rawData.response || rawData.answer;
            
            // ถ้า API ส่งมาเป็น String ตรงๆ โดยไม่มี Key หุ้ม
            if (!aiResponseText && typeof rawData === 'string') {
                aiResponseText = rawData;
            } else if (!aiResponseText) {
                // ถ้าหา Key ไม่เจอจริงๆ ให้แสดงโครงสร้าง JSON ออกมาให้เราเห็น
                aiResponseText = JSON.stringify(rawData);
            }

            appendBotMessage(aiResponseText);

        } catch (error) {
            console.error("AI Chat Error:", error);
            removeTypingIndicator();
            appendBotMessage("⚠️ ไม่สามารถเชื่อมต่อกับระบบ LLM ได้ (กรุณาตรวจสอบ Console F12 หรือสถานะ CORS)");
        }
    }

    function appendBotMessage(text) {
        const msgWrapper = document.createElement('div');
        msgWrapper.className = 'message-wrapper bot';
        
        // 🌟 แปลงข้อความ Markdown เป็น HTML สวยๆ ด้วย marked.js
        let formattedHtml = text;
        if (typeof marked !== 'undefined') {
            formattedHtml = marked.parse(text, { breaks: true });
        }
        
        msgWrapper.innerHTML = `
            <div class="message-content">
                <div class="message-bubble">${formattedHtml}</div>
                <div class="message-time">${getCurrentTime()}</div>
            </div>
        `;
        chatHistory.appendChild(msgWrapper);
        scrollToBottom();
    }

    function showTypingIndicator() {
        const msgWrapper = document.createElement('div');
        msgWrapper.className = 'message-wrapper bot typing-indicator';
        msgWrapper.id = 'typing-indicator';
        msgWrapper.innerHTML = `
            <div class="message-content">
                <div class="message-bubble">
                    <div class="typing-dots">
                        <div class="dot"></div>
                        <div class="dot"></div>
                        <div class="dot"></div>
                    </div>
                </div>
            </div>
        `;
        chatHistory.appendChild(msgWrapper);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    sendBtn.addEventListener('click', () => appendUserMessage(inputField.value));
    inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') appendUserMessage(inputField.value);
    });

    tagButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            inputField.value = e.target.textContent;
            inputField.focus(); 
        });
    });
}