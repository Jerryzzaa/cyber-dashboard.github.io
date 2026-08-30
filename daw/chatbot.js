function initChatbot() {
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

    function appendUserMessage(text) {
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
        
        setTimeout(() => {
            removeTypingIndicator();
            appendBotMessage(`รับทราบครับ ระบบกำลังตรวจสอบข้อมูลเกี่ยวกับ: "${text}"`);
        }, 1500); 
    }

    function appendBotMessage(text) {
        const msgWrapper = document.createElement('div');
        msgWrapper.className = 'message-wrapper bot';
        msgWrapper.innerHTML = `
            <div class="message-content">
                <div class="message-bubble">${text}</div>
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

    sendBtn.addEventListener('click', () => {
        appendUserMessage(inputField.value);
    });

    inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            appendUserMessage(inputField.value);
        }
    });

    tagButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const text = e.target.textContent;
            inputField.value = text;
            inputField.focus(); 
        });
    });
}