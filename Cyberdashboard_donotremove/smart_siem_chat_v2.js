/* Smart SIEM V2 chat iframe. All requests in this file go to Node 3 only. */
const NODE3_AI_BASE = "http://172.24.5.36:8001/api/ai";
const CHAT_SCOPE = "all_model_output";
const STORAGE_KEY = "chatHistoryData"; // Reuse the key from the actual PoC chat.
const REPORT_TITLE = "รายงานสถานการณ์ความปลอดภัย";
const REPORT_POLL_MS = 3000;
const REPORT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_MESSAGES = 50;
const REPORT_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

class ChatApiError extends Error {
  constructor(status, detail) {
    super(`Node 3 HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

async function requestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(`${NODE3_AI_BASE}${path}`, { credentials: "omit", ...options });
  } catch (cause) {
    throw new Error("network", { cause });
  }
  let data;
  try { data = await response.json(); }
  catch (cause) {
    if (!response.ok) throw new ChatApiError(response.status, null);
    throw new Error("invalid_json", { cause });
  }
  if (!response.ok) throw new ChatApiError(response.status, data?.detail ?? data?.error);
  return data;
}

function askAI(message) {
  return requestJson("/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, audience: "auto", scope: CHAT_SCOPE }),
  });
}

function createExecutiveReport(message) {
  return requestJson("/reports", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, audience: "auto", scope: CHAT_SCOPE, title: REPORT_TITLE }),
  });
}

function reportPath(reportId) {
  if (typeof reportId !== "string" || !REPORT_ID_RE.test(reportId))
    throw new Error("invalid_report_id");
  return `/reports/${reportId}`;
}

function getReportStatus(reportId) { return requestJson(reportPath(reportId)); }
function getReportDownloadUrl(reportId) { return `${NODE3_AI_BASE}${reportPath(reportId)}/download`; }

function isReportRequest(text) {
  const value = String(text || "").trim().toLowerCase();
  return /(?:ขอ|สร้าง|ทำ|ดาวน์โหลด|โหลด)(?:ไฟล์)?\s*(?:รายงาน|pdf)/i.test(value)
    || /รายงาน\s*pdf|pdf\s*report|report\s*pdf/i.test(value)
    || /\b(?:create|generate|make|download)\s+(?:a\s+)?(?:pdf|report)\b/i.test(value);
}

function chatErrorMessage(error) {
  if (error instanceof ChatApiError) {
    if (error.status === 422) return "คำขอไม่ถูกต้อง กรุณาลองใหม่";
    if (error.status === 503) return "AI กำลังไม่พร้อมใช้งานชั่วคราว กรุณาลองอีกครั้ง";
    return `AI Server ตอบกลับผิดพลาด (HTTP ${error.status}) กรุณาลองใหม่`;
  }
  if (error?.message === "empty_response") return "AI Server ยังไม่ส่งคำตอบกลับมา กรุณาลองใหม่";
  if (error?.message === "invalid_json") return "AI Server ส่งข้อมูลไม่ถูกต้อง กรุณาลองใหม่";
  return "เชื่อมต่อ AI Server ไม่ได้ กรุณาตรวจสอบ VPN หรือเครือข่าย";
}

function reportErrorMessage(error) {
  return ((error instanceof ChatApiError && [422, 503].includes(error.status))
    || error?.message === "network") ? chatErrorMessage(error)
    : "สร้างรายงานไม่สำเร็จ กรุณาลองใหม่";
}

function logError(operation, error) {
  console.error(`Smart SIEM ${operation}`, {
    status: error instanceof ChatApiError ? error.status : undefined,
    detail: error instanceof ChatApiError ? error.detail : undefined,
    message: error?.message || "unknown error",
  });
}

// Persist only bounded UI facts. Old {sender,text,time} entries remain valid.
function safeTableBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  const safe = [];
  for (const block of blocks.slice(0, 3)) {
    if (block?.type !== "table" || !Array.isArray(block.columns) || !Array.isArray(block.rows)) continue;
    const columns = block.columns.slice(0, 8).filter((column) =>
      column && typeof column.key === "string" && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(column.key)
      && typeof column.label === "string")
      .map((column) => ({ key: column.key, label: column.label.slice(0, 80) }));
    if (!columns.length) continue;
    const rows = block.rows.slice(0, 20).filter((row) =>
      row && typeof row === "object" && !Array.isArray(row)).map((row) => {
      const cells = {};
      for (const column of columns) {
        const value = row[column.key];
        cells[column.key] = typeof value === "string" ? value.slice(0, 180)
          : typeof value === "number" && Number.isFinite(value) ? value
          : typeof value === "boolean" ? value : null;
      }
      return cells;
    });
    safe.push({ type: "table", title: typeof block.title === "string"
      ? block.title.slice(0, 120) : "ตารางข้อมูล", columns, rows });
  }
  return safe;
}

function safeUiBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  const safe = [];
  for (const block of blocks.slice(0, 3)) {
    if (block?.type === "table") { safe.push(...safeTableBlocks([block])); continue; }
    if (block?.type === "cve_candidates" && block.synthetic === true
        && block.source === "poc_synthetic_catalog" && Array.isArray(block.items)) {
      const items = block.items.slice(0, 5).filter((item) => item?.synthetic === true
        && item.source === "poc_synthetic_catalog"
        && /^(?:SIM-CVE-\d{4}-\d{3}|POC-VULN-\d{3})$/.test(item.id || ""))
        .map((item) => ({ id: item.id,
          title: String(item.title || "").slice(0, 120),
          severity_hint: String(item.severity_hint || "").slice(0, 30),
          cvss_hint: typeof item.cvss_hint === "number" && Number.isFinite(item.cvss_hint)
            && item.cvss_hint >= 0 && item.cvss_hint <= 10 ? item.cvss_hint : null,
          related_ports: Array.isArray(item.related_ports) ? item.related_ports.slice(0, 5)
            .filter((port) => Number.isInteger(port) && port > 0 && port <= 65535) : [],
          related_signal: typeof item.related_signal === "string" ? item.related_signal.slice(0, 100) : "",
          summary: String(item.summary || "").slice(0, 400),
          recommended_check: String(item.recommended_check || "").slice(0, 400),
          synthetic: true, source: "poc_synthetic_catalog" }));
      if (items.length) safe.push({ type: "cve_candidates", title: String(block.title || "CVE Candidates").slice(0, 120),
        synthetic: true, source: "poc_synthetic_catalog", items });
    } else if (block?.type === "map_summary" && Array.isArray(block.items)) {
      const items = block.items.slice(0, 10).filter((item) =>
        typeof item?.label === "string" && Number.isInteger(item.count) && item.count >= 0)
        .map((item) => ({ label: item.label.slice(0, 100), count: item.count,
          country_source: typeof item.country_source === "string" ? item.country_source.slice(0, 100) : "" }));
      if (items.length) safe.push({ type: "map_summary", title: String(block.title || "Observed Geography").slice(0, 120), items });
    }
  }
  return safe;
}

function safeEntry(item) {
  if (!item || typeof item.text !== "string" || !["user", "bot"].includes(item.sender)) return null;
  const result = { sender: item.sender, text: item.text.slice(0, 12000),
    time: typeof item.time === "string" ? item.time.slice(0, 24) : "" };
  if (item.sender === "bot") {
    const blocks = safeUiBlocks(item.ui_blocks);
    if (blocks.length) result.ui_blocks = blocks;
    if (item.report && REPORT_ID_RE.test(item.report.id || "") &&
        ["queued", "running", "generating", "ready"].includes(item.report.status)) {
      result.report = { id: item.report.id, status: item.report.status };
    }
  }
  return result;
}

function initChat() {
  const sidebar = document.querySelector(".ai-sidebar");
  const history = document.getElementById("chatHistory");
  const input = document.getElementById("aiInput");
  const send = document.getElementById("sendBtn");
  const reportButton = document.getElementById("createReportBtn");
  if (!history || !input) return;
  let entries = [];
  let chatBusy = false;
  let reportBusy = false;

  function messageTime() {
    return new Date().toLocaleTimeString("en-GB", {
      timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false,
    });
  }

  function persist() {
    try { window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_MESSAGES))); }
    catch (error) { console.warn("Smart SIEM chat history unavailable", error?.name); }
  }

  function readHistory() {
    try {
      const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.map(safeEntry).filter(Boolean).slice(-MAX_MESSAGES) : [];
    } catch (_) { return []; }
  }

  function renderTableBlock(block, content) {
    const card = document.createElement("div");
    card.className = "chat-table-card";
    const title = document.createElement("div");
    title.className = "chat-table-title";
    title.textContent = block.title;
    const scroll = document.createElement("div");
    scroll.className = "chat-table-scroll";
    const table = document.createElement("table");
    table.className = "chat-data-table";
    const head = document.createElement("thead");
    const heading = document.createElement("tr");
    for (const column of block.columns) {
      const th = document.createElement("th");
      th.textContent = column.label;
      heading.appendChild(th);
    }
    head.appendChild(heading);
    const body = document.createElement("tbody");
    for (const row of block.rows) {
      const tr = document.createElement("tr");
      for (const column of block.columns) {
        const td = document.createElement("td");
        const value = row[column.key];
        td.textContent = value === null || value === undefined ? "—" : String(value);
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    table.append(head, body);
    scroll.appendChild(table);
    card.append(title, scroll);
    content.appendChild(card);
  }

  function labeledText(className, value) {
    const node = document.createElement("div");
    node.className = className;
    node.textContent = value;
    return node;
  }

  function renderCveBlock(block, content) {
    const list = document.createElement("div");
    list.className = "chat-cve-list";
    list.appendChild(labeledText("chat-cve-heading", block.title));
    for (const item of block.items) {
      const card = document.createElement("div");
      card.className = "chat-cve-card";
      card.appendChild(labeledText("chat-cve-id", item.id));
      card.appendChild(labeledText("chat-cve-title", item.title));
      const hints = [item.severity_hint, item.cvss_hint === null ? "" : String(item.cvss_hint),
        item.related_ports.length ? `Port ${item.related_ports.join(", ")}` : "",
        item.related_signal].filter(Boolean);
      card.appendChild(labeledText("chat-cve-meta", hints.join(" · ")));
      card.appendChild(labeledText("chat-cve-summary", item.summary));
      card.appendChild(labeledText("chat-cve-action", `ตรวจสอบ: ${item.recommended_check}`));
      list.appendChild(card);
    }
    content.appendChild(list);
  }

  function renderMapBlock(block, content) {
    const card = document.createElement("div");
    card.className = "chat-map-summary";
    card.appendChild(labeledText("chat-map-title", block.title));
    for (const item of block.items) {
      card.appendChild(labeledText("chat-map-row",
        `${item.label}: ${item.count.toLocaleString()} สัญญาณ${item.country_source ? ` · ${item.country_source}` : ""}`));
    }
    content.appendChild(card);
  }

  function renderUiBlocks(blocks, content) {
    for (const block of safeUiBlocks(blocks)) {
      if (block.type === "table") renderTableBlock(block, content);
      else if (block.type === "cve_candidates") renderCveBlock(block, content);
      else if (block.type === "map_summary") renderMapBlock(block, content);
    }
  }

  function renderReportAttachment(reportId, content) {
    const card = document.createElement("div");
    card.className = "report-attachment";
    const title = document.createElement("div");
    title.className = "report-attachment-title";
    title.textContent = `📄 ${REPORT_TITLE}`;
    const detail = document.createElement("div");
    detail.className = "report-attachment-status";
    detail.textContent = "พร้อมดาวน์โหลด";
    const link = document.createElement("a");
    link.className = "download-link";
    link.href = getReportDownloadUrl(reportId);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "ดาวน์โหลด PDF";
    card.append(title, detail, link);
    content.appendChild(card);
  }

  function renderMessage(entry) {
    const wrapper = document.createElement("div");
    wrapper.className = `message-wrapper ${entry.sender === "user" ? "user" : "bot"}`;
    if (entry.ui_blocks?.length) wrapper.classList.add("has-structured");
    const content = document.createElement("div");
    content.className = "message-content";
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    if (entry.sender === "bot" && window.marked?.parse && window.DOMPurify?.sanitize) {
      bubble.innerHTML = window.DOMPurify.sanitize(window.marked.parse(entry.text));
    } else {
      bubble.textContent = entry.text;
      bubble.style.whiteSpace = "pre-wrap";
    }
    content.appendChild(bubble);
    if (entry.sender === "bot") {
      renderUiBlocks(entry.ui_blocks, content);
      if (entry.report?.status === "ready") renderReportAttachment(entry.report.id, content);
    }
    const stamp = document.createElement("div");
    stamp.className = "message-time";
    stamp.textContent = entry.time;
    content.appendChild(stamp);
    wrapper.appendChild(content);
    history.appendChild(wrapper);
    history.scrollTop = history.scrollHeight;
    return { wrapper, bubble, content };
  }

  function addMessage(text, sender = "bot", extra = {}, save = true) {
    const entry = safeEntry({ sender, text, time: messageTime(), ...extra });
    const view = renderMessage(entry);
    if (save) { entries.push(entry); entries = entries.slice(-MAX_MESSAGES); persist(); }
    return { entry, ...view };
  }

  function updateReport(view, text, status = null) {
    view.entry.text = text;
    view.bubble.textContent = text; // Progress and failure text do not contain model HTML.
    if (status && view.entry.report) view.entry.report.status = status;
    persist();
    history.scrollTop = history.scrollHeight;
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
    for (let i = 0; i < 3; i += 1) dots.appendChild(document.createElement("span"));
    bubble.appendChild(dots);
    content.appendChild(bubble);
    wrapper.appendChild(content);
    history.appendChild(wrapper);
    history.scrollTop = history.scrollHeight;
    return wrapper;
  }

  async function waitForExecutiveReport(reportId, onProgress) {
    const deadline = Date.now() + REPORT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const result = await getReportStatus(reportId);
      if (result.status === "ready") return result;
      if (["failed", "error"].includes(result.status)) throw new Error(`report_${result.status}`);
      if (!["queued", "running", "generating"].includes(result.status))
        throw new Error("unknown_report_status");
      onProgress(result.status);
      await new Promise((resolve) => window.setTimeout(resolve, REPORT_POLL_MS));
    }
    throw new Error("report_timeout");
  }

  async function finishReport(view, reportId) {
    try {
      await waitForExecutiveReport(reportId, (status) => {
        updateReport(view, "กำลังสร้างรายงานสำหรับผู้บริหาร...", status);
      });
      updateReport(view, "รายงาน PDF พร้อมดาวน์โหลดแล้ว", "ready");
      renderReportAttachment(reportId, view.content);
    } catch (error) {
      logError("report status", error);
      view.entry.report = undefined;
      updateReport(view, reportErrorMessage(error));
    } finally {
      reportBusy = false;
      if (reportButton) { reportButton.disabled = false; reportButton.textContent = "สร้าง PDF"; }
    }
  }

  async function runReport(message) {
    if (reportBusy) return;
    reportBusy = true; // Set before the first await: one action creates one job.
    if (reportButton) { reportButton.disabled = true; reportButton.textContent = "กำลังสร้าง…"; }
    const view = addMessage("กำลังสร้างรายงานสำหรับผู้บริหาร...", "bot");
    try {
      const job = await createExecutiveReport(message);
      reportPath(job.report_id); // Validate the ID before storing or using it.
      view.entry.report = { id: job.report_id, status: "queued" };
      persist();
      await finishReport(view, job.report_id);
    } catch (error) {
      logError("report create", error);
      updateReport(view, reportErrorMessage(error));
      reportBusy = false;
      if (reportButton) { reportButton.disabled = false; reportButton.textContent = "สร้าง PDF"; }
    }
  }

  async function sendMessage(candidate) {
    const text = String(candidate ?? input.value).trim();
    if (!text || chatBusy) return;
    if (text.toLowerCase() === "clear") { clearChatHistory(); input.value = ""; return; }
    if (isReportRequest(text) && reportBusy) {
      addMessage("มีรายงานกำลังสร้างอยู่แล้ว กรุณารอสักครู่", "bot", {}, false);
      return;
    }
    addMessage(text, "user");
    sidebar?.classList.remove("is-empty");
    input.value = "";
    if (isReportRequest(text)) { await runReport(text); return; }
    chatBusy = true;
    if (send) send.disabled = true;
    const typing = showTypingIndicator();
    try {
      const result = await askAI(text);
      if (typeof result.response !== "string" || !result.response.trim()) throw new Error("empty_response");
      typing.remove();
      addMessage(result.response, "bot", { ui_blocks: result.ui_blocks });
    } catch (error) {
      typing.remove();
      logError("chat request", error);
      addMessage(chatErrorMessage(error), "bot", {}, false);
    } finally {
      chatBusy = false;
      if (send) send.disabled = false;
      input.focus();
    }
  }

  function clearChatHistory() {
    if (reportBusy) return;
    entries = [];
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch (_) { /* storage unavailable */ }
    history.replaceChildren();
    sidebar?.classList.add("is-empty");
    addMessage("พร้อมใช้งาน ถามเกี่ยวกับสัญญาณที่ระบบตรวจพบได้เลย", "bot", {}, false);
  }

  const saved = readHistory();
  if (saved.length) {
    entries = saved;
    sidebar?.classList.remove("is-empty");
    history.replaceChildren();
    saved.forEach(renderMessage);
    const pending = [...saved].reverse().find((entry) =>
      entry.report && ["queued", "running", "generating"].includes(entry.report.status));
    if (pending) {
      const wrappers = history.querySelectorAll(".message-wrapper.bot");
      const wrapper = [...wrappers].find((node) => node.querySelector(".message-bubble")?.textContent === pending.text);
      if (wrapper) {
        reportBusy = true;
        if (reportButton) { reportButton.disabled = true; reportButton.textContent = "กำลังสร้าง…"; }
        void finishReport({ entry: pending, wrapper, content: wrapper.querySelector(".message-content"),
          bubble: wrapper.querySelector(".message-bubble") }, pending.report.id);
      }
    }
  } else {
    const initialTime = document.getElementById("initialMessageTime");
    if (initialTime) initialTime.textContent = messageTime();
  }

  send?.addEventListener("click", () => { void sendMessage(); });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
  });
  document.querySelectorAll(".tag-btn").forEach((button) =>
    button.addEventListener("click", () => { void sendMessage(button.textContent); }));
  reportButton?.addEventListener("click", () => {
    if (reportBusy) return;
    addMessage("สร้างรายงานสำหรับผู้บริหาร", "user");
    void runReport("สร้างรายงานสำหรับผู้บริหาร");
  });
  document.getElementById("newChatBtn")?.addEventListener("click", () => {
    if (window.confirm("ต้องการเริ่มแชทใหม่และลบประวัติในแท็บนี้ใช่หรือไม่?")) clearChatHistory();
  });
  document.getElementById("expandBtn")?.addEventListener("click", () => {
    if (window.self !== window.top) window.top.location.href = "chatbot.html";
    else window.location.href = "dash.html";
  });
}

window.SmartSiemChatV2 = Object.freeze({
  NODE3_AI_BASE, askAI, isReportRequest, createExecutiveReport,
  getReportStatus, getReportDownloadUrl, safeTableBlocks, safeUiBlocks, initChat,
});
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initChat, { once: true });
else initChat();
