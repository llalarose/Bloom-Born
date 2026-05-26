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
const profilePanel = document.querySelector("#profilePanel");

const baseFields = ["nickname", "relationship", "ageSense", "traits", "occupation", "interests", "speechStyle", "background", "boundaries"];
const optionalFieldAliases = {
  archetypePreset: ["archetypePreset", "archetype", "styleArchetype", "preset"],
  toneTags: ["toneTags", "toneTag", "tone", "tones"],
  dislikedStyles: ["dislikedStyles", "dislikedStyle", "avoidStyles", "avoidStyle"],
  tabooStyles: ["tabooStyles", "tabooStyle", "taboo", "taboos"],
  replyLength: ["replyLength", "replyLengthPreference", "responseLength", "lengthPreference"]
};
const optionalFields = Object.keys(optionalFieldAliases);

function hasCharacter() {
  return Boolean(state.sessionId || state.profile?.id);
}

function switchTo(view) {
  if (!stage) return;
  stage.classList.toggle("active-chat", view === "chat");
  stage.classList.toggle("active-profile", view === "profile");
}

function routeAfterLogin() {
  if (!state.account) {
    stage?.classList.remove("active-chat", "active-profile");
    return;
  }
  switchTo(hasCharacter() ? "chat" : "profile");
}

function persist() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!saved) return;
    Object.assign(state, saved);
    if (saved.profile?.source) {
      state.profile.source = normalizeSource(saved.profile.source);
      fillCharacterForm(state.profile.source);
    }
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

function firstNonEmpty(source, names) {
  for (const name of names) {
    const value = source?.[name];
    if (value === 0 || value) return value;
  }
  return "";
}

function splitValue(value) {
  if (Array.isArray(value)) return value.map((item) => compact(item)).filter(Boolean);
  return String(value || "")
    .split(/[,\n|/]+/)
    .map((item) => compact(item))
    .filter(Boolean);
}

function formToPayload(form) {
  const payload = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (Object.hasOwn(payload, key)) {
      payload[key] = Array.isArray(payload[key]) ? [...payload[key], value] : [payload[key], value];
    } else {
      payload[key] = value;
    }
  }
  return payload;
}

function normalizeSource(source) {
  const normalized = { ...(source || {}) };
  for (const key of optionalFields) {
    const aliasValue = firstNonEmpty(source, optionalFieldAliases[key]);
    if (aliasValue || aliasValue === 0) normalized[key] = aliasValue;
  }
  return normalized;
}

function setFormValue(name, rawValue) {
  if (!characterForm) return;
  const nodes = characterForm.querySelectorAll(`[name="${name}"]`);
  if (!nodes.length) return;
  const normalizedList = splitValue(rawValue).map((item) => item.toLowerCase());
  const listSet = new Set(normalizedList);
  nodes.forEach((node) => {
    if (node instanceof HTMLInputElement && (node.type === "checkbox" || node.type === "radio")) {
      node.checked = listSet.has(String(node.value || "").toLowerCase());
      return;
    }
    if ("value" in node) node.value = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue || "";
  });
}

function fillCharacterForm(source) {
  if (!characterForm) return;
  const normalized = normalizeSource(source);
  for (const key of baseFields) {
    const input = characterForm.elements.namedItem(key);
    if (input && "value" in input) input.value = Array.isArray(normalized[key]) ? normalized[key].join(", ") : normalized[key] || "";
  }
  for (const key of optionalFields) setFormValue(key, normalized[key]);
  syncPresetButtons();
}

function getFormValuesFor(names) {
  for (const name of names) {
    const nodes = characterForm?.querySelectorAll(`[name="${name}"]`);
    if (!nodes?.length) continue;
    const checkable = [...nodes].filter(
      (node) => node instanceof HTMLInputElement && (node.type === "checkbox" || node.type === "radio")
    );
    if (checkable.length) {
      const selected = checkable.filter((node) => node.checked).map((node) => node.value).filter(Boolean);
      return selected;
    }
    const value = compact(nodes[0].value);
    if (value) return splitValue(value);
  }
  return [];
}

function syncPresetButtons() {
  if (!characterForm) return;
  const payload = formToPayload(characterForm);
  const current = compact(firstNonEmpty(payload, optionalFieldAliases.archetypePreset));
  document.querySelectorAll("[data-archetype-preset], [data-preset]").forEach((node) => {
    const value = compact(node.getAttribute("data-archetype-preset") || node.getAttribute("data-preset"));
    const active = Boolean(value && current && value.toLowerCase() === current.toLowerCase());
    node.classList.toggle("is-active", active);
    if ("ariaPressed" in node) node.ariaPressed = String(active);
  });
}

function applyPresetValue(field, value, mode = "set") {
  if (!characterForm) return;
  const names = optionalFieldAliases[field] || [field];
  const controls = names.flatMap((name) => [...characterForm.querySelectorAll(`[name="${name}"]`)]);
  if (!controls.length) return;
  const lower = String(value || "").toLowerCase();
  const checkable = controls.filter(
    (node) => node instanceof HTMLInputElement && (node.type === "checkbox" || node.type === "radio")
  );
  if (checkable.length) {
    if (checkable.some((node) => node.type === "radio")) {
      checkable.forEach((node) => {
        node.checked = String(node.value || "").toLowerCase() === lower;
      });
      syncPresetButtons();
      return;
    }
    const target = checkable.find((node) => String(node.value || "").toLowerCase() === lower);
    if (target) target.checked = mode === "toggle" ? !target.checked : true;
    return;
  }

  const current = getFormValuesFor(names).map((item) => item.toLowerCase());
  if (mode === "toggle") {
    const next = new Set(current);
    if (next.has(lower)) next.delete(lower);
    else next.add(lower);
    setFormValue(names[0], [...next]);
  } else {
    setFormValue(names[0], value);
  }
}

function initOptionalPresetWiring() {
  if (!characterForm) return;
  document.querySelectorAll("[data-archetype-preset], [data-preset]").forEach((node) => {
    node.addEventListener("click", () => {
      const value = compact(node.getAttribute("data-archetype-preset") || node.getAttribute("data-preset"));
      if (!value) return;
      applyPresetValue("archetypePreset", value, "set");
      syncPresetButtons();
    });
  });

  const toggleMap = [
    { selectors: "[data-tone-tag]", field: "toneTags", attrs: ["data-tone-tag"] },
    { selectors: "[data-disliked-style], [data-avoid-style]", field: "dislikedStyles", attrs: ["data-disliked-style", "data-avoid-style"] },
    { selectors: "[data-taboo-style]", field: "tabooStyles", attrs: ["data-taboo-style"] }
  ];
  toggleMap.forEach(({ selectors, field, attrs }) => {
    document.querySelectorAll(selectors).forEach((node) => {
      node.addEventListener("click", () => {
        const value = compact(attrs.map((attr) => node.getAttribute(attr)).find(Boolean));
        if (!value) return;
        applyPresetValue(field, value, "toggle");
      });
    });
  });
}

function syncTopbar() {
  const nickname = state.profile?.source?.nickname || "Bloom Bond";
  const relation = state.profile?.source?.relationship || "No character yet";
  if (chatName) chatName.textContent = nickname;
  if (chatSubtitle) chatSubtitle.textContent = relation;
  if (roleName) roleName.textContent = nickname;
  if (youName) youName.textContent = state.account || "You";
}

function renderSoulPreview() {
  if (!soulPreview) return;
  if (!state.profile?.persona) {
    soulPreview.innerHTML = "No soul preview yet. Fill the profile manually or import a text/markdown file first.";
    return;
  }
  const persona = state.profile.persona;
  soulPreview.innerHTML = `
    <strong>Core</strong><br>${escapeHtml(persona.core || "Pending")}<br><br>
    <strong>Language Style</strong><br>${escapeHtml(persona.languageStyle || "Pending")}<br><br>
    <strong>Relationship State</strong><br>${escapeHtml(persona.relationshipState || "Pending")}
  `;
}

function renderMessages() {
  if (!messagesEl) return;
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
  if (!messageInput) return;
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

function applyParsedProfile(source) {
  const normalized = normalizeSource(source);
  fillCharacterForm(normalized);
  state.profile = {
    id: state.profile?.id || "",
    source: normalized,
    persona: {
      core: `${normalized.nickname || "Unnamed character"} profile draft imported.`,
      languageStyle: normalized.speechStyle || "Pending",
      relationshipState: normalized.background || "Pending"
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

async function parseSelectedFile() {
  const file = profileFile?.files?.[0];
  if (!file) throw new Error("Please select a file to import.");
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) {
    throw new Error("DOC/DOCX is not supported in this web build. Save as .txt or .md first.");
  }
  if (!/\.(txt|md|markdown)$/.test(lower)) {
    throw new Error("Only .txt / .md / .markdown are supported.");
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

  if (data.source) fillCharacterForm(normalizeSource(data.source));
  if (data.profile) {
    const normalizedSource = normalizeSource(data.profile.source || data.source || {});
    state.profile = {
      ...data.profile,
      source: normalizedSource,
      id: state.profile?.id || data.profile.id || ""
    };
    fillCharacterForm(normalizedSource);
  } else if (data.source) {
    applyParsedProfile(data.source);
  }
  renderSoulPreview();
  syncTopbar();
  return {
    fileName: file.name,
    notice: data.encoding ? `${data.notice || "Imported."} (encoding: ${data.encoding})` : data.notice || "Imported."
  };
}

loginForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const payload = formToPayload(loginForm);
  state.account = compact(payload.account);
  routeAfterLogin();
  syncTopbar();
  persist();
});

importForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (fileHint) fileHint.textContent = "Parsing...";
  try {
    const data = await parseSelectedFile();
    if (fileHint) fileHint.textContent = data.notice || `Imported ${data.fileName}`;
    persist();
  } catch (error) {
    if (fileHint) fileHint.textContent = `Import failed: ${error.message}`;
  }
});

characterForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToPayload(characterForm);
  const normalizedPayload = { ...payload };
  for (const key of optionalFields) {
    const existing = firstNonEmpty(payload, optionalFieldAliases[key]);
    if (existing || existing === 0) normalizedPayload[key] = existing;
  }

  if (createOrUpdateButton) createOrUpdateButton.disabled = true;
  try {
    if (!state.sessionId) {
      const data = await request("/api/characters", { method: "POST", body: JSON.stringify(normalizedPayload) });
      state.profile = data.profile ? { ...data.profile, source: normalizeSource(data.profile.source || normalizedPayload) } : data.profile;
      state.sessionId = data.profile?.id || "";
      state.messages = data.messages || [];
    } else {
      const data = await request(`/api/characters/${encodeURIComponent(state.sessionId)}`, {
        method: "PATCH",
        body: JSON.stringify(normalizedPayload)
      });
      state.profile = data.profile ? { ...data.profile, source: normalizeSource(data.profile.source || normalizedPayload) } : data.profile;
    }
    fillCharacterForm(state.profile?.source || normalizedPayload);
    syncTopbar();
    renderSoulPreview();
    renderMessages();
    showChatHint("Character updated. Continue chatting.");
    switchTo("chat");
    persist();
  } catch (error) {
    alert(`Save failed: ${error.message}`);
  } finally {
    if (createOrUpdateButton) createOrUpdateButton.disabled = false;
  }
});

messageForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = compact(messageInput?.value);
  if (!content || state.loading) return;
  if (!state.sessionId) {
    showChatHint("No character yet. Create one first.");
    switchTo("profile");
    return;
  }
  state.messages.push({ role: "user", content, createdAt: new Date().toISOString() });
  state.loading = true;
  if (messageInput) messageInput.value = "";
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
    showChatHint(`Send failed: ${error.message}`);
  } finally {
    state.loading = false;
    renderMessages();
  }
});

messageInput?.addEventListener("input", autoResizeInput);
messageInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    messageForm?.requestSubmit();
  }
});

openProfileButton?.addEventListener("click", () => {
  switchTo("profile");
});

backToChatButton?.addEventListener("click", () => {
  switchTo("chat");
});

profileToChatButton?.addEventListener("click", () => {
  switchTo("chat");
});

profilePanel?.addEventListener("dblclick", () => {
  if (window.innerWidth <= 1100) switchTo("chat");
});

["dragenter", "dragover"].forEach((name) => {
  importForm?.addEventListener(name, (event) => {
    event.preventDefault();
    importForm.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((name) => {
  importForm?.addEventListener(name, (event) => {
    event.preventDefault();
    importForm.classList.remove("dragging");
  });
});

importForm?.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (!file || !profileFile) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  profileFile.files = transfer.files;
  if (fileHint) fileHint.textContent = `Selected ${file.name}`;
});

profileFile?.addEventListener("change", () => {
  const file = profileFile.files?.[0];
  if (file && fileHint) fileHint.textContent = `Selected ${file.name}`;
});

initOptionalPresetWiring();
restore();
syncTopbar();
renderSoulPreview();
