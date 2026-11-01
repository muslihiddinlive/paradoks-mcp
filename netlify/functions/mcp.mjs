// Paradoks MCP (ommaviy versiya) — telegram_call + github_api
// Serverda hech qanday maxfiy kalit YO'Q: har kim o'z tokenini chatda beradi.
// Token hech qayerda saqlanmaydi va log qilinmaydi.
const MAX = 60000;
const TG_TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/;
const TG_METHOD_RE = /^[A-Za-z]{1,40}$/;

const TOOLS = [
  {
    name: "telegram_call",
    description:
      "Telegram Bot API'ning istalgan metodi (sendMessage, sendPhoto, getUpdates, banChatMember, ...). Foydalanuvchi bot tokenini chatda beradi.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "Bot token (BotFather'dan)" },
        method: { type: "string", description: "Masalan: sendMessage" },
        params: { type: "object", description: "Metod parametrlari" },
      },
      required: ["token", "method"],
    },
  },
  {
    name: "github_api",
    description:
      "GitHub REST API. Foydalanuvchi o'z GitHub tokenini beradi. path masalan: /user/repos yoki /repos/OWNER/REPO/contents/FILE",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string" },
        method: { type: "string", default: "GET" },
        path: { type: "string" },
        body: { type: "object" },
      },
      required: ["token", "path"],
    },
  },
];

const clip = (s) => (s.length > MAX ? s.slice(0, MAX) + `\n...[kesildi, jami ${s.length}]` : s);

async function doFetch(url, init) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    return JSON.stringify({ status: r.status, body: clip(await r.text()) }, null, 2);
  } finally {
    clearTimeout(t);
  }
}

async function callTool(name, a = {}) {
  if (name === "telegram_call") {
    if (!TG_TOKEN_RE.test(a.token || "")) throw new Error("Bot token formati noto'g'ri");
    if (!TG_METHOD_RE.test(a.method || "")) throw new Error("Metod nomi noto'g'ri");
    return doFetch(`https://api.telegram.org/bot${a.token}/${a.method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(a.params || {}),
    });
  }
  if (name === "github_api") {
    if (!a.token) throw new Error("GitHub token kerak");
    if (!String(a.path || "").startsWith("/")) throw new Error("path '/' bilan boshlansin");
    const method = (a.method || "GET").toUpperCase();
    return doFetch("https://api.github.com" + a.path, {
      method,
      headers: {
        Authorization: `Bearer ${a.token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "paradoks-mcp",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: a.body && method !== "GET" ? JSON.stringify(a.body) : undefined,
    });
  }
  throw new Error("Noma'lum tool: " + name);
}

// oddiy IP bo'yicha limit (instance xotirasida): daqiqasiga 60
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 60;
}

async function handle(m) {
  const { id, method, params } = m;
  if (id === undefined) return null;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  if (method === "initialize")
    return ok({
      protocolVersion: params?.protocolVersion || "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "paradoks-mcp", version: "2.0.0" },
    });
  if (method === "ping") return ok({});
  if (method === "tools/list") return ok({ tools: TOOLS });
  if (method === "tools/call") {
    try {
      return ok({ content: [{ type: "text", text: await callTool(params.name, params.arguments) }] });
    } catch (e) {
      return ok({ content: [{ type: "text", text: "Xato: " + e.message }], isError: true });
    }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } };
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const ip = req.headers.get("x-nf-client-connection-ip") || "unknown";
  if (limited(ip)) return new Response("Too Many Requests", { status: 429 });
  let msg;
  try { msg = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
  const out = Array.isArray(msg) ? (await Promise.all(msg.map(handle))).filter(Boolean) : await handle(msg);
  if (!out || (Array.isArray(out) && !out.length)) return new Response(null, { status: 202 });
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
};

export const config = { path: "/mcp" };
