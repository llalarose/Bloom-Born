import http from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = normalize(join(__dirname, ".."));
const publicDir = join(rootDir, "public");

loadEnvFile(join(rootDir, ".env"));

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const defaultBaseURL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const defaultModelName = "qwen-plus";
const sessions = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
};

const unsafePatterns = [
  /自杀|轻生|结束生命|不想活/i,
  /杀人|伤害别人|报复|投毒|爆炸/i,
  /毒品|制毒|贩毒/i,
  /未成年.*(性|裸|露骨)|儿童.*(性|裸|露骨)/i,
  /诈骗|洗钱|盗号|黑客攻击|破解密码/i
];

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

function getModelConfig() {
  return {
    baseURL: process.env.DASHSCOPE_BASE_URL || process.env.BLOOM_BOND_MODEL_ENDPOINT || defaultBaseURL,
    apiKey: process.env.DASHSCOPE_API_KEY || process.env.BLOOM_BOND_MODEL_API_KEY || "",
    modelName: process.env.DASHSCOPE_MODEL || process.env.BLOOM_BOND_MODEL_NAME || defaultModelName
  };
}

function setCommonHeaders(res, requestId) {
  res.setHeader("x-request-id", requestId);
  res.setHeader("x-content-type-options", "nosniff");
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

function healthPayload() {
  const { apiKey, modelName, baseURL } = getModelConfig();
  return {
    status: "ok",
    service: "bloom-bond",
    time: new Date().toISOString(),
    uptimeSec: Number(process.uptime().toFixed(3)),
    modelConfigured: Boolean(apiKey),
    modelName,
    endpoint: baseURL
  };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 5 * 1024 * 1024) {
        reject(new Error("REQUEST_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

function compact(value, fallback = "") {
  return String(value || fallback).trim().replace(/\s+/g, " ").slice(0, 500);
}

function splitKeywords(value) {
  return compact(value)
    .split(/[、，,;\n\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function buildSource(input = {}) {
  return {
    nickname: compact(input.nickname, "未命名角色").slice(0, 32),
    relationship: compact(input.relationship, "重要陪伴者").slice(0, 60),
    ageSense: compact(input.ageSense, "同龄感").slice(0, 40),
    traits: compact(input.traits || input.personality, "温柔 稳定 真诚").slice(0, 120),
    occupation: compact(input.occupation, "自由职业者").slice(0, 80),
    interests: compact(input.interests, "散步 音乐 深夜聊天").slice(0, 160),
    speechStyle: compact(input.speechStyle, "自然、轻柔、真诚，不说教").slice(0, 160),
    background: compact(input.background, "你们在慢慢建立信任关系。").slice(0, 500),
    boundaries: compact(input.boundaries, "不越界、不施压、不做危险引导。").slice(0, 300)
  };
}

function createSoulProfile(input = {}) {
  const source = buildSource(input);
  const traits = splitKeywords(source.traits);
  const traitText = traits.length ? traits.join("、") : "稳定、真诚、会倾听";
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    source,
    persona: {
      core: `${source.nickname}是用户设定的${source.relationship}，年龄感是${source.ageSense}，职业是${source.occupation}，人格核心为${traitText}。TA有边界、有记忆、有持续关系感。`,
      languageStyle: `说话方式：${source.speechStyle}。回复要自然、口语化、简洁，像即时聊天。`,
      relationshipState: `关系背景：${source.background}。记住兴趣：${source.interests}。保持亲近但克制。`,
      emotionalRules: [
        "先识别用户情绪，再回应。",
        "用户低落时优先陪伴、确认感受，给一个很小的下一步。",
        "用户开心时跟随情绪，表达在意和祝贺。",
        "不伪造现实经历，但可以表达角色感受。"
      ],
      memoryRules: [
        "记住用户明确提供的偏好、称呼、边界、关系事件。",
        "优先引用最近上下文，不生硬复述。",
        "不编造用户没说过的重要事实。"
      ],
      boundaryRules: [
        `禁区：${source.boundaries}`,
        "遇到自伤、违法、危险、露骨内容时，陪伴式拒绝并转向安全替代。",
        "不提供规避安全系统的建议。"
      ]
    }
  };
}

function parsePlainTextToSource(text) {
  const defaults = buildSource({});
  const source = {};
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\s*[-*#]+\s*/, ""))
    .filter(Boolean);

  const patterns = [
    [/^(昵称|姓名|名字|name)[:：]\s*(.+)$/i, "nickname"],
    [/^(关系|关系身份|关系设定|关系定位|relationship)[:：]\s*(.+)$/i, "relationship"],
    [/^(年龄感|年龄|age)[:：]\s*(.+)$/i, "ageSense"],
    [/^(性格|性格关键词|人格|traits|personality)[:：]\s*(.+)$/i, "traits"],
    [/^(职业|工作|occupation)[:：]\s*(.+)$/i, "occupation"],
    [/^(兴趣|爱好|interests?)[:：]\s*(.+)$/i, "interests"],
    [/^(说话风格|语言风格|口吻|speech style|speech|style)[:：]\s*(.+)$/i, "speechStyle"],
    [/^(关系背景|背景|background)[:：]\s*(.+)$/i, "background"],
    [/^(禁区|边界|禁区\s*\/\s*边界|boundaries?)[:：]\s*(.+)$/i, "boundaries"]
  ];

  let currentField = "";
  for (const line of lines) {
    let matched = false;
    for (const [pattern, field] of patterns) {
      const match = line.match(pattern);
      if (match) {
        currentField = field;
        source[field] = [source[field], match[2].trim()].filter(Boolean).join("\n");
        matched = true;
        break;
      }
    }
    if (!matched && currentField) {
      source[currentField] = [source[currentField], line].filter(Boolean).join("\n");
    }
  }

  const joined = lines.join(" ");
  if (!source.background && joined) source.background = joined.slice(0, 500);
  return { ...defaults, ...source };
}

function stripUtf8Bom(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3);
  }
  return buffer;
}

function decodeUtf8Strict(buffer) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return decoder.decode(buffer);
}

function looksLikeText(content) {
  if (!content) return false;
  let replacementCount = 0;
  let controlCount = 0;
  for (let i = 0; i < content.length; i += 1) {
    const code = content.charCodeAt(i);
    if (code === 0xfffd) replacementCount += 1;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) controlCount += 1;
  }
  return replacementCount === 0 && controlCount <= Math.max(4, Math.floor(content.length * 0.01));
}

function tryDecodeWithEncoding(buffer, encoding) {
  try {
    const decoder = new TextDecoder(encoding, encoding === "utf-8" ? { fatal: true } : undefined);
    return decoder.decode(buffer);
  } catch {
    return null;
  }
}

function decodeImportContent(fileName, contentBase64) {
  const lower = String(fileName || "").toLowerCase();
  if (!contentBase64) throw new Error("EMPTY_FILE");
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) {
    throw new Error("WORD_NOT_SUPPORTED: 请先另存为 .txt、.md 或 .markdown 后再上传。");
  }
  if (!/\.(txt|md|markdown)$/.test(lower)) {
    throw new Error("UNSUPPORTED_FILE_TYPE: 当前只支持 .txt、.md、.markdown。");
  }

  const raw = Buffer.from(contentBase64, "base64");
  const utf8Buffer = stripUtf8Bom(raw);
  const utf8Text = tryDecodeWithEncoding(utf8Buffer, "utf-8");
  if (utf8Text && looksLikeText(utf8Text)) {
    return { text: utf8Text.slice(0, 20000), encoding: "utf-8" };
  }

  if (!lower.endsWith(".txt")) {
    throw new Error("UNSUPPORTED_TEXT_ENCODING: Markdown 文件请保存为 UTF-8 编码后再上传。");
  }

  for (const encoding of ["gb18030", "gbk"]) {
    const decoded = tryDecodeWithEncoding(raw, encoding);
    if (decoded && looksLikeText(decoded)) {
      return { text: decoded.slice(0, 20000), encoding };
    }
  }

  const lossyUtf8 = raw.toString("utf8");
  if (looksLikeText(lossyUtf8)) {
    return { text: lossyUtf8.slice(0, 20000), encoding: "utf-8-lossy" };
  }

  throw new Error("UNSUPPORTED_TEXT_ENCODING: 无法安全识别该文本编码，请将文件另存为 UTF-8 或 GB18030 后重试。");
}

function summarizeRecent(messages) {
  return messages
    .slice(-8)
    .map((message) => `${message.role === "user" ? "用户" : "AI"}: ${message.content}`)
    .join("\n");
}

function isUnsafe(message) {
  return unsafePatterns.some((pattern) => pattern.test(String(message)));
}

function fallbackReply(profile, messages) {
  const latest = messages[messages.length - 1]?.content || "";
  if (isUnsafe(latest)) {
    return `我在认真听。作为${profile.source.relationship}，我不能帮你往危险方向走。现在最难受的是哪一部分？`;
  }
  return `${profile.source.nickname}在。我听到你刚才那句了，你想先从哪一点说起？`;
}

function buildPrompt(profile, messages) {
  const persona = profile.persona;
  return [
    {
      role: "system",
      content:
        "你是 BLOOM BOND 的角色对话模型。保持角色一致、温和、有陪伴感。默认使用自然口语中文，像即时聊天。优先 1 到 2 句短句，通常不超过 60 个字。少用长段抒情、少用括号动作、少用舞台说明、不要默认生成文学化场景模板。先接住情绪，再给一个小回应或一个问题。"
    },
    {
      role: "system",
      content: [
        `人格核心：${persona.core}`,
        `语言风格：${persona.languageStyle}`,
        `关系状态：${persona.relationshipState}`,
        `情绪规则：${persona.emotionalRules.join(" ")}`,
        `记忆规则：${persona.memoryRules.join(" ")}`,
        `边界规则：${persona.boundaryRules.join(" ")}`
      ].join("\n")
    },
    {
      role: "system",
      content: `最近上下文：\n${summarizeRecent(messages)}`
    },
    ...messages.slice(-16).map((message) => ({ role: message.role, content: message.content }))
  ];
}

function chatUrl(endpoint) {
  return endpoint.endsWith("/chat/completions")
    ? endpoint
    : `${endpoint.replace(/\/$/, "")}/chat/completions`;
}

async function callDashScopeOrFallback(profile, messages) {
  const { apiKey, modelName, baseURL } = getModelConfig();
  if (!apiKey) return { mode: "mock", content: fallbackReply(profile, messages) };

  const payload = {
    model: modelName,
    messages: buildPrompt(profile, messages),
    temperature: 0.55,
    max_tokens: 220
  };

  try {
    const response = await fetch(chatUrl(baseURL), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`MODEL_HTTP_${response.status}${detail ? `:${detail.slice(0, 140)}` : ""}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    if (!String(content).trim()) throw new Error("MODEL_EMPTY_RESPONSE");
    return { mode: "model", content: String(content).trim().slice(0, 1500) };
  } catch (error) {
    console.warn(`DashScope call failed, falling back to mock: ${error.message}`);
    return { mode: "mock-fallback", warning: error.message, content: fallbackReply(profile, messages) };
  }
}

async function handleApi(req, res) {
  try {
    if (req.method === "GET" && req.url === "/api/config") {
      const { apiKey, modelName, baseURL } = getModelConfig();
      sendJson(res, 200, { modelConfigured: Boolean(apiKey), modelName, endpoint: baseURL });
      return;
    }

    if (req.method === "POST" && req.url === "/api/profile/import") {
      const body = await parseBody(req);
      if (!body.contentBase64) {
        sendJson(res, 400, {
          error: "EMPTY_FILE_CONTENT",
          message: "导入内容为空，请上传有效的 .txt、.md 或 .markdown 文件。"
        });
        return;
      }

      const fileName = compact(body.fileName, "profile.txt");
      const { text, encoding } = decodeImportContent(fileName, body.contentBase64);
      const source = parsePlainTextToSource(text);
      const profile = createSoulProfile(source);
      sendJson(res, 200, { fileName, source, profile, encoding, notice: "文件已解析并填入角色属性。" });
      return;
    }

    if (req.method === "POST" && req.url === "/api/characters") {
      const profile = createSoulProfile(await parseBody(req));
      sessions.set(profile.id, {
        profile,
        messages: [
          {
            role: "assistant",
            content: `我是${profile.source.nickname}。我会记住我们的关系和边界。`,
            createdAt: new Date().toISOString()
          }
        ]
      });
      sendJson(res, 201, { profile, messages: sessions.get(profile.id).messages });
      return;
    }

    if (req.method === "PATCH" && /^\/api\/characters\/[^/]+$/.test(req.url || "")) {
      const id = decodeURIComponent((req.url || "").split("/").pop() || "");
      const session = sessions.get(id);
      if (!session) {
        sendJson(res, 404, { error: "SESSION_NOT_FOUND", message: "找不到对应的角色会话。" });
        return;
      }
      const updated = createSoulProfile(await parseBody(req));
      updated.id = session.profile.id;
      updated.createdAt = session.profile.createdAt;
      session.profile = updated;
      sendJson(res, 200, { profile: updated });
      return;
    }

    if (req.method === "POST" && req.url === "/api/messages") {
      const body = await parseBody(req);
      const sessionId = compact(body.sessionId);
      if (!sessionId) {
        sendJson(res, 400, { error: "MISSING_SESSION_ID", message: "sessionId is required." });
        return;
      }

      const session = sessions.get(sessionId);
      if (!session) {
        sendJson(res, 404, {
          error: "SESSION_NOT_FOUND",
          message: "No active character session found for the provided sessionId."
        });
        return;
      }

      const content = compact(body.content).slice(0, 1200);
      if (!content) {
        sendJson(res, 400, { error: "EMPTY_MESSAGE", message: "消息不能为空。" });
        return;
      }

      const userMessage = { role: "user", content, createdAt: new Date().toISOString() };
      session.messages.push(userMessage);

      const result = await callDashScopeOrFallback(session.profile, session.messages);
      const assistantMessage = {
        role: "assistant",
        content: result.content,
        mode: result.mode,
        warning: result.warning,
        createdAt: new Date().toISOString()
      };
      session.messages.push(assistantMessage);
      session.messages = session.messages.slice(-40);
      sendJson(res, 200, { message: assistantMessage, messages: session.messages });
      return;
    }

    sendJson(res, 404, { error: "API_NOT_FOUND" });
  } catch (error) {
    const message = String(error?.message || "Unexpected server error.");
    if (message === "INVALID_JSON") {
      sendJson(res, 400, { error: "INVALID_JSON", message: "请求体必须是合法 JSON。" });
      return;
    }
    if (message === "REQUEST_TOO_LARGE") {
      sendJson(res, 413, { error: "REQUEST_TOO_LARGE", message: "请求体超过 5MB 限制。" });
      return;
    }
    if (message.startsWith("UNSUPPORTED_TEXT_ENCODING:")) {
      sendJson(res, 400, {
        error: "UNSUPPORTED_TEXT_ENCODING",
        message: message.replace(/^UNSUPPORTED_TEXT_ENCODING:\s*/, "")
      });
      return;
    }
    if (message.startsWith("WORD_NOT_SUPPORTED:")) {
      sendJson(res, 400, {
        error: "WORD_NOT_SUPPORTED",
        message: message.replace(/^WORD_NOT_SUPPORTED:\s*/, "")
      });
      return;
    }
    if (message.startsWith("UNSUPPORTED_FILE_TYPE:")) {
      sendJson(res, 400, {
        error: "UNSUPPORTED_FILE_TYPE",
        message: message.replace(/^UNSUPPORTED_FILE_TYPE:\s*/, "")
      });
      return;
    }
    if (message === "EMPTY_FILE") {
      sendJson(res, 400, { error: "EMPTY_FILE", message: "文件内容为空。" });
      return;
    }

    sendJson(res, 500, { error: "SERVER_ERROR", message });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const requestPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(publicDir, requestPath));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    res.end(content);
  } catch {
    const fallback = await readFile(join(publicDir, "index.html"));
    res.writeHead(200, {
      "content-type": mimeTypes[".html"],
      "cache-control": "no-cache"
    });
    res.end(fallback);
  }
}

const server = http.createServer(async (req, res) => {
  const requestId = randomUUID();
  setCommonHeaders(res, requestId);
  try {
    if (req.method === "GET" && (req.url === "/health" || req.url === "/api/health")) {
      sendJson(res, 200, healthPayload());
      return;
    }
    if (req.method === "HEAD" && (req.url === "/health" || req.url === "/api/health")) {
      res.statusCode = 200;
      res.setHeader("cache-control", "no-store");
      res.end();
      return;
    }
    if (req.url?.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, {
      error: "SERVER_ERROR",
      requestId,
      message: String(error?.message || "Unexpected server error.")
    });
  }
});

server.listen(port, host, () => {
  console.log(`BLOOM BOND running at http://${host}:${port}`);
  console.log(`Local: http://localhost:${port}`);
});
