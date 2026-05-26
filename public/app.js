const state = {
  account: "",
  profile: null,
  sessionId: "",
  messages: [],
  loading: false
};

const storageKey = "bloom-bond-v2-session";

const stage = document.querySelector(".stage");
const loginForm = document.querySelector("#loginForm");
const importForm = document.querySelector("#importForm");
const characterForm = document.querySelector("#characterForm");
const messageForm = document.querySelector("#messageForm");
const profileFile = document.querySelector("#profileFile");
const fileHint = document.querySelector("#fileHint");
const soulPreview = document.querySelector("#soulPreview");
const createOrUpdateButton = document.querySelector("#createOrUpdateButton");
const openProfileButton = document.querySelector("#openProfileButton");
const backToChatButton = document.querySelector("#backToChatButton");
const profileToChatButton = document.querySelector("#profileToChatButton");
const messageInput = document.querySelector("#messageInput");
const messagesEl = document.querySelector("#messages");
const chatName = document.querySelector("#chatName");
const chatSubtitle = document.querySelector("#chatSubtitle");
const youName = document.querySelector("#youName");
const roleName = document.querySelector("#roleName");
const chatHint = document.querySelector("#chatHint");

const fields = ["nickname", "relationship", "ageSense", "traits", "occupation", "interests", "speechStyle", "background", "boundaries"];

function hasCharacter() {
  return Boolean(state.sessionId || state.profile?.id);
}

function routeAfterLogin() {
  if (!state.account) {
    stage.classList.remove("active-chat", "active-profile");
    return;
  }
  stage.classList.toggle("active-chat", hasCharacter());
  stage.classList.toggle("active-profile", !hasCharacter());
}

function persist() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!saved) return;
    Object.assign(state, saved);
    if (saved.profile?.source) fillCharacterForm(saved.profile.source);
    syncTopbar();
    renderMessages();
    renderSoulPreview();
    routeAfterLogin();
  } catch {
    localStorage.removeItem(storageKey);
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "REQUEST_FAILED");
  return data;
}

function compact(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formToPayload(form) {
  const payload = {};
  for (const [key, value] of new FormData(form).entries()) payload[key] = value;
  return payload;
}

function fillCharacterForm(source) {
  for (const key of fields) {
    const input = characterForm.elements.namedItem(key);
    if (input) input.value = Array.isArray(source[key]) ? source[key].join("、") : source[key] || "";
  }
}

function syncTopbar() {
  const nickname = state.profile?.source?.nickname || "Bloom Bond";
  const relation = state.profile?.source?.relationship || "尚未创建角色";
  chatName.textContent = nickname;
  chatSubtitle.textContent = relation;
  roleName.textContent = nickname;
  youName.textContent = state.account || "你";
}

function renderSoulPreview() {
  if (!state.profile?.persona) {
    soulPreview.innerHTML = "还没有生成灵魂画像。你可以手动填写角色属性，或先导入文本 / Markdown 文件。";
    return;
  }
  const persona = state.profile.persona;
  soulPreview.innerHTML = `
    <strong>人格核心</strong><br>${escapeHtml(persona.core || "待补充")}<br><br>
    <strong>语言风格</strong><br>${escapeHtml(persona.languageStyle || "待补充")}<br><br>
    <strong>关系状态</strong><br>${escapeHtml(persona.relationshipState || "待补充")}
  `;
}

function renderMessages() {
  messagesEl.innerHTML = "";
  for (const message of state.messages) {
    const row = document.createElement("div");
    row.className = `message-row ${message.role}`;
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = message.content;
    row.appendChild(bubble);
    messagesEl.appendChild(row);
  }
  if (state.loading) {
    const row = document.createElement("div");
    row.className = "message-row assistant";
    row.innerHTML = `<div class="bubble">...</div>`;
    messagesEl.appendChild(row);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function autoResizeInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
}

let hintTimer = null;
function showChatHint(text) {
  if (!chatHint) return;
  chatHint.textContent = text;
  chatHint.classList.add("show");
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => chatHint.classList.remove("show"), 3600);
}

function parseProfileText(text) {
  const aliases = new Map([
    ["姓名", "nickname"],
    ["名字", "nickname"],
    ["昵称", "nickname"],
    ["name", "nickname"],
    ["关系", "relationship"],
    ["关系身份", "relationship"],
    ["身份", "relationship"],
    ["relationship", "relationship"],
    ["年龄", "ageSense"],
    ["年龄感", "ageSense"],
    ["age", "ageSense"],
    ["职业", "occupation"],
    ["工作", "occupation"],
    ["occupation", "occupation"],
    ["性格", "traits"],
    ["人格", "traits"],
    ["性格关键词", "traits"],
    ["traits", "traits"],
    ["personality", "traits"],
    ["兴趣", "interests"],
    ["爱好", "interests"],
    ["interests", "interests"],
    ["说话风格", "speechStyle"],
    ["语言风格", "speechStyle"],
    ["口吻", "speechStyle"],
    ["speech style", "speechStyle"],
    ["关系背景", "background"],
    ["背景", "background"],
    ["background", "background"],
    ["禁区", "boundaries"],
    ["边界", "boundaries"],
    ["禁区 / 边界", "boundaries"],
    ["boundaries", "boundaries"]
  ]);

  const parsed = {};
  let currentField = "";
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[-*#]+\s*/, "").trim();
    if (!line) continue;
    const match = line.match(/^([^:：]{1,24})[:：]\s*(.*)$/);
    if (match) {
      const field = aliases.get(match[1].trim().toLowerCase());
      if (field) {
        currentField = field;
        parsed[field] = [parsed[field], match[2].trim()].filter(Boolean).join("\n");
        continue;
      }
    }
    const headingField = aliases.get(line.replace(/[：:]$/, "").trim().toLowerCase());
    if (headingField) {
      currentField = headingField;
      continue;
    }
    if (currentField) parsed[currentField] = [parsed[currentField], line].filter(Boolean).join("\n");
  }
  if (!Object.keys(parsed).length && text) parsed.background = String(text).trim().slice(0, 500);
  return parsed;
}

function applyParsedProfile(source) {
  fillCharacterForm(source);
  state.profile = {
    id: state.profile?.id || "",
    source,
    persona: {
      core: `${source.nickname || "未命名角色"} 的资料草稿已导入。`,
      languageStyle: source.speechStyle || "待补充",
      relationshipState: source.background || "待补充"
    }
  };
  renderSoulPreview();
  syncTopbar();
}

async function parseSelectedFile() {
  const file = profileFile.files?.[0];
  if (!file) throw new Error("请先选择要导入的文件");
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) {
    throw new Error("当前 H5 版本不支持直接解析 Word，请先另存为 .txt 或 .md 后导入");
  }
  if (!/\.(txt|md|markdown)$/.test(lower)) {
    throw new Error("当前仅支持 .txt / .md / .markdown");
  }

  const text = await file.text();
  const parsed = parseProfileText(text);
  applyParsedProfile(parsed);
  return { fileName: file.name, source: parsed, notice: "文件已解析并填入角色属性。" };
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const payload = formToPayload(loginForm);
  state.account = compact(payload.account);
  routeAfterLogin();
  syncTopbar();
  persist();
});

importForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  fileHint.textContent = "正在解析...";
  try {
    const data = await parseSelectedFile();
    fileHint.textContent = data.notice || `已解析 ${data.fileName}`;
    persist();
  } catch (error) {
    fileHint.textContent = `解析失败：${error.message}`;
  }
});

characterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToPayload(characterForm);
  createOrUpdateButton.disabled = true;
  try {
    if (!state.sessionId) {
      const data = await request("/api/characters", { method: "POST", body: JSON.stringify(payload) });
      state.profile = data.profile;
      state.sessionId = data.profile.id;
      state.messages = data.messages || [];
      createOrUpdateButton.textContent = "更新角色属性";
    } else {
      const data = await request(`/api/characters/${encodeURIComponent(state.sessionId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      state.profile = data.profile;
      createOrUpdateButton.textContent = "更新角色属性";
    }
    syncTopbar();
    renderSoulPreview();
    renderMessages();
    showChatHint("角色已更新，可以继续对话。");
    if (window.innerWidth <= 1100) {
      stage.classList.remove("active-profile");
      stage.classList.add("active-chat");
    }
    persist();
  } catch (error) {
    alert(`保存失败：${error.message}`);
  } finally {
    createOrUpdateButton.disabled = false;
  }
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = compact(messageInput.value);
  if (!content || state.loading) return;
  if (!state.sessionId) {
    showChatHint("还没有角色，先去「角色属性」创建后再开始对话。");
    stage.classList.remove("active-chat");
    stage.classList.add("active-profile");
    return;
  }
  state.messages.push({ role: "user", content, createdAt: new Date().toISOString() });
  state.loading = true;
  messageInput.value = "";
  autoResizeInput();
  renderMessages();
  try {
    const data = await request("/api/messages", {
      method: "POST",
      body: JSON.stringify({ sessionId: state.sessionId, content })
    });
    state.messages = data.messages || state.messages;
    persist();
  } catch (error) {
    showChatHint(`发送失败：${error.message}`);
  } finally {
    state.loading = false;
    renderMessages();
  }
});

messageInput.addEventListener("input", autoResizeInput);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    messageForm.requestSubmit();
  }
});

openProfileButton.addEventListener("click", () => {
  stage.classList.remove("active-chat");
  stage.classList.add("active-profile");
});

backToChatButton.addEventListener("click", () => {
  stage.classList.remove("active-profile");
  stage.classList.add("active-chat");
});

profileToChatButton?.addEventListener("click", () => {
  stage.classList.remove("active-profile");
  stage.classList.add("active-chat");
});

document.querySelector("#profilePanel").addEventListener("dblclick", () => {
  if (window.innerWidth <= 1100) {
    stage.classList.remove("active-profile");
    stage.classList.add("active-chat");
  }
});

["dragenter", "dragover"].forEach((name) => {
  importForm.addEventListener(name, (event) => {
    event.preventDefault();
    importForm.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((name) => {
  importForm.addEventListener(name, (event) => {
    event.preventDefault();
    importForm.classList.remove("dragging");
  });
});

importForm.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  profileFile.files = transfer.files;
  fileHint.textContent = `已选择 ${file.name}`;
});

profileFile.addEventListener("change", () => {
  const file = profileFile.files?.[0];
  if (file) fileHint.textContent = `已选择 ${file.name}`;
});

restore();
syncTopbar();
renderSoulPreview();
