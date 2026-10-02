/* Smart SIEM V2 chat iframe. Only this file calls Node 3. */
const NODE3_AI_BASE = "http://172.24.5.36:8001/api/ai";
const CHAT_SCOPE = "all_model_output";
const HISTORY_KEY = "smart-siem-v2-chat";
const MAX_VISIBLE = 20;
let messages = [];
let busy = false;
let reportBusy = false;

function historyForRequest() {
  return messages.filter((item) => item.role === "user" || item.role === "assistant")
    .slice(-10).map((item) => ({ role: item.role, content: item.content.slice(0, 1000) }));
}

function saveHistory() {
  try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-MAX_VISIBLE))); }
  catch (_) { /* Private browsing can disable storage. The current chat still works. */ }
}

function loadHistory() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
    if (Array.isArray(stored)) messages = stored.filter((item) =>
      item && ["user", "assistant"].includes(item.role) && typeof item.content === "string"
    ).slice(-MAX_VISIBLE);
  } catch (_) { messages = []; }
}

function chatList() { return document.getElementById("chatHistory"); }

function appendBubble(role, content, options = {}) {
  const list = chatList();
  if (!list) return null;
  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper ${role === "user" ? "user" : "bot"}`;
  const bubble = document.createElement("div");
  bubble.className = `message-bubble${options.kind ? ` ${options.kind}` : ""}`;
  bubble.textContent = content;
  wrapper.appendChild(bubble);
  if (options.href) {
    const link = document.createElement("a");
    link.className = "download-link";
    link.href = options.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "ดาวน์โหลดรายงาน PDF";
    wrapper.appendChild(link);
  }
  list.appendChild(wrapper);
  list.scrollTop = list.scrollHeight;
  return wrapper;
}

function remember(role, content) {
  messages.push({ role, content });
  messages = messages.slice(-MAX_VISIBLE);
  saveHistory();
  appendBubble(role, content);
}

function showError(message) { appendBubble("assistant", message, { kind: "error" }); }

async function node3Json(path, init = {}) {
  let response;
  try {
    response = await fetch(NODE3_AI_BASE + path, { credentials: "omit", ...init });
  } catch (_) { throw new Error("ติดต่อ Node 3 ไม่ได้ โปรดตรวจสอบ VPN และบริการ AI"); }
  let payload;
  try { payload = await response.json(); }
  catch (_) { throw new Error(`Node 3 ตอบกลับไม่ถูกต้อง (HTTP ${response.status})`); }
  if (!response.ok) {
    const detail = payload?.detail;
    const readable = typeof detail === "string" ? detail
      : (typeof detail?.message === "string" ? detail.message : null);
    if (response.status === 422) throw new Error(readable || "คำขอไม่ถูกต้อง โปรดตรวจสอบข้อความแล้วลองใหม่ (422)");
    if (response.status === 503) throw new Error(readable || "บริการ AI ยังไม่พร้อม (503)");
    if (response.status === 404) throw new Error("ไม่พบรายการนี้ หรือรายการหมดอายุแล้ว (404)");
    throw new Error(readable || `Node 3 ตอบกลับผิดพลาด (HTTP ${response.status})`);
  }
  return payload;
}

function isReportIntent(message) {
  return /(?:สร้าง|ทำ|ขอ|ดาวน์โหลด|download|generate|create).{0,36}(?:pdf|รายงาน|report)|(?:pdf|รายงาน|report).{0,36}(?:สร้าง|ทำ|ขอ|ดาวน์โหลด|download|generate|create)/i.test(message);
}

async function createReport(message = "สร้างรายงานภาพรวมสำหรับผู้บริหาร", history = historyForRequest()) {
  if (reportBusy) { appendBubble("assistant", "กำลังสร้างรายงานอยู่แล้ว โปรดรอให้เสร็จก่อน"); return; }
  reportBusy = true;
  const button = document.getElementById("createReportBtn");
  if (button) button.disabled = true;
  const statusBubble = appendBubble("assistant", "กำลังส่งคำขอรายงานสำหรับผู้บริหาร…", { kind: "report-status" });
  try {
    const job = await node3Json("/reports", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, audience: "auto", scope: CHAT_SCOPE, history }),
    });
    if (!job.report_id || !/^[a-zA-Z0-9-]{1,64}$/.test(job.report_id))
      throw new Error("Node 3 ไม่ส่งรหัสรายงานที่ถูกต้อง");
    const id = job.report_id;
    // Reports are asynchronous. Poll only this known Node 3 path; never follow a server-supplied URL.
    for (let attempt = 0; attempt < 150; attempt += 1) {
      statusBubble.firstChild.textContent = `กำลังจัดทำรายงานสำหรับผู้บริหาร… (${Math.round(attempt * 2 / 60)} นาที)`;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const state = await node3Json(`/reports/${id}`);
      if (state.status === "ready") {
        statusBubble.remove();
        appendBubble("assistant", "📄 รายงานสถานการณ์ความปลอดภัยพร้อมดาวน์โหลดแล้ว", {
          kind: "report-ready", href: `${NODE3_AI_BASE}/reports/${id}/download`,
        });
        return;
      }
      if (state.status === "failed") {
        const detail = state.error;
        throw new Error(typeof detail?.message === "string" ? detail.message : "การสร้างรายงานไม่สำเร็จ");
      }
    }
    throw new Error("รายงานยังไม่พร้อมภายใน 5 นาที โปรดลองใหม่ภายหลัง");
  } catch (error) {
    statusBubble.remove();
    showError(error.message);
  } finally {
    reportBusy = false;
    if (button) button.disabled = false;
  }
}

async function sendMessage(rawMessage) {
  const message = String(rawMessage || "").trim();
  if (!message || busy) return;
  if (message.length > 4000) { showError("ข้อความยาวเกิน 4,000 ตัวอักษร"); return; }
  const history = historyForRequest();
  busy = true;
  const input = document.getElementById("aiInput");
  const send = document.getElementById("sendBtn");
  if (input) input.value = "";
  if (send) send.disabled = true;
  remember("user", message);
  try {
    if (isReportIntent(message)) {
      await createReport(message, history);
      return;
    }
    const typing = appendBubble("assistant", "กำลังวิเคราะห์ข้อมูล…", { kind: "typing" });
    try {
      const reply = await node3Json("/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, audience: "auto", scope: CHAT_SCOPE }),
      });
      typing.remove();
      const response = typeof reply.response === "string" ? reply.response.trim() : "";
      if (!response) throw new Error("Node 3 ไม่ส่งคำตอบกลับมา");
      remember("assistant", response);
    } catch (error) { typing.remove(); throw error; }
  } catch (error) { showError(error.message); }
  finally { busy = false; if (send) send.disabled = false; input?.focus(); }
}

function initChat() {
  loadHistory();
  if (messages.length) messages.forEach((item) => appendBubble(item.role, item.content));
  else appendBubble("assistant", "สวัสดีครับ ถามภาพรวม สัญญาณล่าสุด หรือขอรายงาน PDF ได้เลยครับ");
  const input = document.getElementById("aiInput");
  document.getElementById("sendBtn")?.addEventListener("click", () => sendMessage(input?.value));
  input?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); sendMessage(input.value); } });
  document.querySelectorAll(".tag-btn").forEach((button) =>
    button.addEventListener("click", () => sendMessage(button.textContent)));
  document.getElementById("createReportBtn")?.addEventListener("click", () => createReport());
  document.getElementById("newChatBtn")?.addEventListener("click", () => {
    if (busy || reportBusy) return;
    messages = []; saveHistory(); chatList()?.replaceChildren();
    appendBubble("assistant", "เริ่มแชตใหม่แล้วครับ ต้องการให้ช่วยดูข้อมูลส่วนไหน?");
  });
  document.getElementById("expandBtn")?.addEventListener("click", () => {
    try { window.parent.document.body.classList.toggle("chat-expanded"); }
    catch (_) { /* Standalone iframe still works. */ }
  });
}

window.SmartSiemAI = Object.freeze({ NODE3_AI_BASE, sendMessage, createReport, isReportIntent });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initChat, { once: true });
else initChat();
