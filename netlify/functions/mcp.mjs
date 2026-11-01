// Paradoks MCP — http_request + github_api + telegram_call
// Netlify env: MCP_KEY (majburiy), GITHUB_TOKEN (ixtiyoriy), TG_TOKEN (ixtiyoriy)
const MAX = 60000;

const TOOLS = [
  {
    name: "http_request",
    description: "Istalgan URLga HTTP so'rov yuboradi (GET/POST/...). Javob: status, headers, body (qisqartirilgan).",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        method: { type: "string", default: "GET" },
        headers: { type: "object", additionalProperties: { type: "string" } },
        body: { type: "string", description: "Matn yoki JSON string" },
      },
      required: ["url"],
    },
  },
  {
    name: "github_api",
    description: "GitHub REST API. path masalan: /user/repos yoki /repos/OWNER/REPO/contents/FILE. Token serverdagi GITHUB_TOKEN dan olinadi.",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string", default: "GET" },
        path: { type: "string" },
        body: { type: "object" },
      },
      required: ["path"],
    },
  },
  {
    name: "telegram_call",
    description: "Telegram Bot API istalgan metodi (sendMessage, getUpdates, ...). token berilmasa serverdagi TG_TOKEN ishlatiladi.",
    inputSchema: {
      type: "object",
      properties: {
        method: { type: "string" },
        params: { type: "object" },
        token: { type: "string" },
      },
      required: ["method"],
    },
  },
];

const clip = (s) => (s.length > MAX ? s.slice(0, MAX) + `\n...[kesildi, jami ${s.length}]` : s);

async function doFetch(url, init) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    const text = await r.text();
    const headers = {};
    for (const k of ["content-type", "location", "x-ratelimit-remaining"]) {
      if (r.headers.get(k)) headers[k] = r.headers.get(k);
    }
    return JSON.stringify({ status: r.status, headers, body: clip(text) }, null, 2);
  } finally {
    clearTimeout(t);
  }
}

async function callTool(name, a = {}) {
  if (name === "http_request") {
    const method = (a.method || "GET").toUpperCase();
    const hasBody = a.body != null && !["GET", "HEAD"].includes(method);
    return doFetch(a.url, { method, headers: a.headers || {}, body: hasBody ? String(a.body) : undefined });
  }
  if (name === "github_api") {
    const tk = process.env.GITHUB_TOKEN;
    if (!tk) throw new Error("GITHUB_TOKEN sozlanmagan");
    const method = (a.method || "GET").toUpperCase();
    return doFetch("https://api.github.com" + a.path, {
      method,
      headers: {
        Authorization: `Bearer ${tk}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "paradoks-mcp",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: a.body && method !== "GET" ? JSON.stringify(a.body) : undefined,
    });
  }
  if (name === "telegram_call") {
    const tk = a.token || process.env.TG_TOKEN;
    if (!tk) throw new Error("Bot token kerak");
    return doFetch(`https://api.telegram.org/bot${tk}/${a.method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(a.params || {}),
    });
  }
  throw new Error("Noma'lum tool: " + name);
}

async function handle(m) {
  const { id, method, params } = m;
  if (id === undefined) return null; // notification
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const err = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (method === "initialize")
    return ok({
      protocolVersion: params?.protocolVersion || "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "paradoks-mcp", version: "1.0.0" },
    });
  if (method === "ping") return ok({});
  if (method === "tools/list") return ok({ tools: TOOLS });
  if (method === "tools/call") {
    try {
      const text = await callTool(params.name, params.arguments);
      return ok({ content: [{ type: "text", text }] });
    } catch (e) {
      return ok({ content: [{ type: "text", text: "Xato: " + e.message }], isError: true });
    }
  }
  return err(-32601, "Method not found");
}

export default async (req) => {
  const key = process.env.MCP_KEY;
  if (!key || new URL(req.url).searchParams.get("key") !== key)
    return new Response("Unauthorized", { status: 401 });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  let msg;
  try { msg = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
  const out = Array.isArray(msg) ? (await Promise.all(msg.map(handle))).filter(Boolean) : await handle(msg);
  if (!out || (Array.isArray(out) && !out.length)) return new Response(null, { status: 202 });
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
};

export const config = { path: "/mcp" };
