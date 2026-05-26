const state = {
  account: "",
  profile: null,
  sessionId: "",
  messages: [],
  loading: false
};

const storageKey = "bloom-bond-v3-session";
const mobileBreakpoint = 1100;
const fields = ["nickname", "relationship", "ageSense", "traits", "occupation", "interests", "speechStyle", "background", "boundaries"];

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

let hintTimer = null;

function hasCharacter() {
  return Boolean(state.sessionId || state.profile?.id);
}

function persist() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function compact(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setView(view) {
  stage.classList.toggle("active-chat", view === "chat");
  stage.classList.toggle("active-profile", view === "profile");
}

function routeAfterLogin() {
  const loggedIn = Boolean(state.account);
  stage.classList.toggle("app-logged-in", loggedIn);
  if (!loggedIn) {
    stage.classList.remove("active-chat", "active-profile");
    return;
  }
  setView(hasCharacter() ? "chat" : "profile");
}

function formToPayload(form) {
  const payload = {};
  for (const [key, value] of new FormData(form).entries()) {
    payload[key] = value;
  }
  return payload;
}

function fillCharacterForm(source = {}) {
  for (const key of fields) {
    const input = characterForm.elements.namedItem(key);
    if (!input) continue;
    input.value = Array.isArray(source[key]) ? source[key].join("、") : source[key] || "";
  }
}

function syncTopbar() {
  const nickname = state.profile?.source?.nickname || "Bloom Bond";
  const relationship = state.profile?.source?.relationship || "尚未创建角色";
  chatName.textContent = nickname;
  chatSubtitle.textContent = relationship;
  roleName.textContent = nickname;
  youName.textContent = state.account || "你";
}

function renderSoulPreview() {
  if (!state.profile?.persona) {
    soulPreview.innerHTML = `
      <strong>人格核心</strong><br>还没有生成角色画像。<br><br>
      <strong>语言风格</strong><br>等待输入。<br><br>
      <strong>关系状态</strong><br>可以先手动填写，或上传资料文件。
    `;
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
    row.innerHTML = `<div class="bubble bubble-loading"><span></span><span></span><span></span></div>`;
    messagesEl.appendChild(row);
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function autoResizeInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
}

function showChatHint(text) {
  if (!chatHint) return;
  chatHint.textContent = text;
  chatHint.classList.add("show");
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => chatHint.classList.remove("show"), 3200);
}

function hydrateDraftProfile(source = {}) {
  fillCharacterForm(source);
  state.profile = {
    id: state.profile?.id || "",
    source,
    persona: {
      core: `${source.nickname || "未命名角色"} 的基础资料已经导入。`,
      languageStyle: source.speechStyle || "等待补充",
      relationshipState: source.background || "等待补充"
    }
  };
  renderSoulPreview();
  syncTopbar();
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
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
  if (!response.ok) throw new Error(data.message || data.error || "请求失败");
  return data;
}

async function parseSelectedFile() {
  const file = profileFile.files?.[0];
  if (!file) throw new Error("请先选择要导入的文件");

  const lower = file.name.toLowerCase();
  if (!/\.(txt|md|markdown)$/.test(lower)) {
    throw new Error("当前仅支持 .txt / .md / .markdown");
  }

  const contentBase64 = arrayBufferToBase64(await file.arrayBuffer());
  const data = await request("/api/profile/import", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      contentBase64
    })
  });

  if (data.source) fillCharacterForm(data.source);

  if (data.profile) {
    state.profile = {
      ...data.profile,
      id: state.profile?.id || data.profile.id || ""
    };
  } else if (data.source) {
    hydrateDraftProfile(data.source);
  }

  renderSoulPreview();
  syncTopbar();

  return data.encoding
    ? `${data.notice || "文件已解析并填入角色属性。"}（编码：${data.encoding}）`
    : data.notice || "文件已解析并填入角色属性。";
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
    autoResizeInput();
  } catch {
    localStorage.removeItem(storageKey);
  }
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
  fileHint.textContent = "正在解析文件...";

  try {
    const notice = await parseSelectedFile();
    fileHint.textContent = notice;
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
      const data = await request("/api/characters", {
        method: "POST",
        body: JSON.stringify(payload)
      });
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
    showChatHint("角色已更新，可以继续聊天。");
    if (window.innerWidth <= mobileBreakpoint) setView("chat");
    persist();
  } catch (error) {
    showChatHint(`保存失败：${error.message}`);
  } finally {
    createOrUpdateButton.disabled = false;
  }
});

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = compact(messageInput.value);

  if (!content || state.loading) return;
  if (!state.sessionId) {
    showChatHint("还没有角色，先去「角色属性」完成设定。");
    setView("profile");
    return;
  }

  state.messages.push({
    role: "user",
    content,
    createdAt: new Date().toISOString()
  });
  state.loading = true;
  messageInput.value = "";
  autoResizeInput();
  renderMessages();

  try {
    const data = await request("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        sessionId: state.sessionId,
        content
      })
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

openProfileButton.addEventListener("click", () => setView("profile"));
backToChatButton.addEventListener("click", () => setView("chat"));
profileToChatButton?.addEventListener("click", () => setView("chat"));

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

window.addEventListener("resize", routeAfterLogin);

restore();
syncTopbar();
renderSoulPreview();
renderMessages();
autoResizeInput();
