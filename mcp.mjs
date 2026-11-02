// Paradoks MCP: Telegram + GitHub + Cloudflare + Netlify + Render (Streamable HTTP, stateless).
// Tokenlar har tool chaqiruvida beriladi va HECH QACHON saqlanmaydi yoki log qilinmaydi.

const TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;
const MAX_OUT = 20000;

const s = (description) => ({ type: "string", description });
const n = (description) => ({ type: "integer", description });
const o = (description) => ({ type: "object", description });
const chat = s("Chat ID yoki @username");

function tool(name, description, method, props = {}, required = []) {
  return {
    name,
    method,
    description,
    inputSchema: {
      type: "object",
      properties: { token: s("Bot token (BotFather'dan)"), ...props },
      required: ["token", ...required],
    },
  };
}

const TOOLS = [
  tool("get_me", "Bot haqida ma'lumot (token tekshirish uchun ham)", "getMe"),
  tool("send_message", "Matnli xabar yuborish", "sendMessage", {
    chat_id: chat, text: s("Xabar matni"), parse_mode: s("HTML yoki MarkdownV2"),
    reply_markup: o("Inline tugmalar: {inline_keyboard:[[{text,callback_data|url}]]}"),
    message_thread_id: n("Topic ID (forum guruhlar uchun)"),
    reply_to_message_id: n("Javob beriladigan xabar ID"),
    disable_notification: { type: "boolean" },
  }, ["chat_id", "text"]),
  tool("send_photo", "Rasm yuborish (URL yoki file_id)", "sendPhoto", {
    chat_id: chat, photo: s("Rasm URL yoki file_id"), caption: s("Izoh"),
    parse_mode: s("HTML yoki MarkdownV2"), reply_markup: o("Inline tugmalar"),
    message_thread_id: n("Topic ID"),
  }, ["chat_id", "photo"]),
  tool("send_document", "Fayl yuborish (URL yoki file_id)", "sendDocument", {
    chat_id: chat, document: s("Fayl URL yoki file_id"), caption: s("Izoh"),
    message_thread_id: n("Topic ID"),
  }, ["chat_id", "document"]),
  tool("edit_message_text", "Yuborilgan xabar matnini tahrirlash", "editMessageText", {
    chat_id: chat, message_id: n("Xabar ID"), text: s("Yangi matn"),
    parse_mode: s("HTML yoki MarkdownV2"), reply_markup: o("Inline tugmalar"),
  }, ["chat_id", "message_id", "text"]),
  tool("delete_message", "Xabarni o'chirish", "deleteMessage", {
    chat_id: chat, message_id: n("Xabar ID"),
  }, ["chat_id", "message_id"]),
  tool("forward_message", "Xabarni uzatish", "forwardMessage", {
    chat_id: chat, from_chat_id: chat, message_id: n("Xabar ID"),
  }, ["chat_id", "from_chat_id", "message_id"]),
  tool("pin_chat_message", "Xabarni qadash", "pinChatMessage", {
    chat_id: chat, message_id: n("Xabar ID"),
  }, ["chat_id", "message_id"]),
  tool("get_chat", "Chat/guruh/kanal ma'lumoti", "getChat", { chat_id: chat }, ["chat_id"]),
  tool("get_chat_member", "A'zo holati", "getChatMember", {
    chat_id: chat, user_id: n("Foydalanuvchi ID"),
  }, ["chat_id", "user_id"]),
  tool("ban_chat_member", "A'zoni ban qilish", "banChatMember", {
    chat_id: chat, user_id: n("Foydalanuvchi ID"), until_date: n("Unix vaqt (ixtiyoriy)"),
  }, ["chat_id", "user_id"]),
  tool("unban_chat_member", "Banni olib tashlash", "unbanChatMember", {
    chat_id: chat, user_id: n("Foydalanuvchi ID"), only_if_banned: { type: "boolean" },
  }, ["chat_id", "user_id"]),
  tool("get_updates", "Yangi xabarlarni olish (webhook o'rnatilgan bo'lsa ishlamaydi; avval delete_webhook)", "getUpdates", {
    offset: n("Oxirgi update_id + 1"), limit: n("1-100"),
  }),
  tool("get_webhook_info", "Webhook holati", "getWebhookInfo"),
  tool("set_webhook", "Webhook o'rnatish", "setWebhook", {
    url: s("HTTPS webhook URL"), secret_token: s("Ixtiyoriy secret"),
  }, ["url"]),
  tool("delete_webhook", "Webhookni o'chirish", "deleteWebhook", {
    drop_pending_updates: { type: "boolean" },
  }),
  tool("get_file_link", "file_id bo'yicha yuklab olish havolasi (token havolada bo'ladi, ehtiyot bo'ling)", "getFile", {
    file_id: s("file_id"),
  }, ["file_id"]),
  tool("call_api", "Istalgan Telegram Bot API metodini chaqirish (yuqoridagilarda yo'q bo'lsa)", null, {
    method: s("Metod nomi, masalan sendPoll, createForumTopic"),
    params: o("Metod parametrlari (JSON)"),
  }, ["method"]),
];

const BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

const _enc = new TextEncoder();
// ───────────── Cloudflare / Netlify / Render ─────────────
const PTOKEN_RE = /^[A-Za-z0-9_\-.]{20,300}$/;
const CF = "https://api.cloudflare.com/client/v4";
const NL = "https://api.netlify.com/api/v1";
const RD = "https://api.render.com/v1";
const confirmP = { type: "boolean", description: "Xavfli/pullik amallar uchun: FAQAT foydalanuvchi aniq ruxsat bergandan keyin true" };
function needConfirm(a, what) {
  if (a.confirm !== true) throw new Error(`TASDIQ KERAK: ${what}. Foydalanuvchidan aniq ruxsat so'rang, keyin confirm:true bilan qayta chaqiring.`);
}

function ptool(name, tokenDesc, description, props = {}, required = []) {
  return {
    name, plat: true, description,
    inputSchema: { type: "object", properties: { token: s(tokenDesc), ...props }, required: ["token", ...required] },
  };
}
const cfT = "Cloudflare API Token (My Profile > API Tokens)";
const nlT = "Netlify Personal access token";
const rdT = "Render API key (Account Settings > API Keys)";
const anyBody = o("JSON tana (ixtiyoriy)");
const methodP = s("GET, POST, PUT, PATCH yoki DELETE");
const cfAcc = s("Cloudflare account ID (cf_list_accounts bilan toping)");
const cfName = s("Worker nomi");
const siteId = s("Netlify site ID (nl_list_sites bilan toping)");
const rdSvc = s("Render service ID (srv-...)");

const P_TOOLS = [
  // Cloudflare
  ptool("cf_verify", cfT, "Cloudflare tokenni tekshirish"),
  ptool("cf_list_accounts", cfT, "Token ko'ra oladigan Cloudflare akkauntlar (account ID olish uchun)"),
  ptool("cf_list_workers", cfT, "Akkauntdagi Worker'lar ro'yxati", { account_id: cfAcc }, ["account_id"]),
  ptool("cf_get_worker_code", cfT, "Worker kodini o'qish", { account_id: cfAcc, name: cfName }, ["account_id", "name"]),
  ptool("cf_deploy_worker", cfT, "Yangi Worker yaratish yoki mavjudini yangilash (ES module kod). workers.dev manzilini ham yoqadi", {
    account_id: cfAcc, name: cfName, code: s("Worker kodi (export default { fetch } ko'rinishida)"),
    compatibility_date: s("Masalan 2025-09-01"),
    compatibility_flags: { type: "array", items: { type: "string" }, description: "Masalan nodejs_compat" },
    bindings: { type: "array", items: { type: "object" }, description: "Binding'lar (KV, D1, plain_text...)" },
    keep_secrets: { type: "boolean", description: "Mavjud secret'larni saqlash (default true)" },
  }, ["account_id", "name", "code"]),
  ptool("cf_set_secret", cfT, "Worker'ga secret qo'shish", { account_id: cfAcc, name: cfName, secret_name: s("Secret nomi"), secret_value: s("Qiymati") }, ["account_id", "name", "secret_name", "secret_value"]),
  ptool("cf_delete_worker", cfT, "Worker'ni o'chirish (XAVFLI, tasdiq kerak)", { account_id: cfAcc, name: cfName, confirm: confirmP }, ["account_id", "name"]),
  ptool("cf_api", cfT, "Istalgan Cloudflare API so'rovi (KV, R2, D1, DNS...). Yo'l /client/v4 dan keyin: /accounts/ID/...", { method: methodP, path: s("Masalan /accounts/ID/d1/database"), body: anyBody, confirm: confirmP }, ["method", "path"]),

  // Netlify
  ptool("nl_whoami", nlT, "Netlify tokenni tekshirish va akkaunt (account_slug) ma'lumoti"),
  ptool("nl_list_sites", nlT, "Saytlar ro'yxati", { per_page: n("1-100") }),
  ptool("nl_create_site", nlT, "Yangi bo'sh sayt yaratish", { name: s("Sayt nomi (nomi.netlify.app)"), account_slug: s("Jamoa slug (ixtiyoriy)") }),
  ptool("nl_deploy_files", nlT, "Statik fayllarni saytga deploy qilish (HTML/CSS/JS, matn). Netlify Functions uchun GitHub repo orqali deploy ishlating", {
    site_id: siteId,
    files: { type: "array", description: "Fayllar", items: { type: "object", properties: { path: s("Masalan index.html"), content: s("Matn (UTF-8)") }, required: ["path", "content"] } },
  }, ["site_id", "files"]),
  ptool("nl_list_deploys", nlT, "Sayt deploy'lari tarixi", { site_id: siteId, per_page: n("1-100") }, ["site_id"]),
  ptool("nl_get_deploy", nlT, "Bitta deploy holati va xato xabari", { deploy_id: s("Deploy ID") }, ["deploy_id"]),
  ptool("nl_rollback", nlT, "Saytni oldingi deploy'ga qaytarish", { site_id: siteId, deploy_id: s("Qaytariladigan deploy ID") }, ["site_id", "deploy_id"]),
  ptool("nl_trigger_build", nlT, "Git'ga ulangan saytda yangi build ishga tushirish", { site_id: siteId }, ["site_id"]),
  ptool("nl_list_env", nlT, "Env o'zgaruvchilar ro'yxati", { account_slug: s("Akkaunt slug (nl_whoami)"), site_id: siteId }, ["account_slug", "site_id"]),
  ptool("nl_set_env", nlT, "Env o'zgaruvchi qo'shish", { account_slug: s("Akkaunt slug"), site_id: siteId, key: s("Nomi"), value: s("Qiymati") }, ["account_slug", "site_id", "key", "value"]),
  ptool("nl_delete_site", nlT, "Saytni butunlay o'chirish (XAVFLI, tasdiq kerak)", { site_id: siteId, confirm: confirmP }, ["site_id"]),
  ptool("nl_api", nlT, "Istalgan Netlify API so'rovi. Yo'l /api/v1 dan keyin: /sites/ID/...", { method: methodP, path: s("Masalan /sites"), body: anyBody, confirm: confirmP }, ["method", "path"]),

  // Render
  ptool("rd_whoami", rdT, "Render tokenni tekshirish va owner ID olish"),
  ptool("rd_list_services", rdT, "Servislar ro'yxati", { limit: n("1-100") }),
  ptool("rd_create_service", rdT, "GitHub repo'dan yangi servis yaratish. Free bo'lmagan reja tasdiq talab qiladi", {
    name: s("Servis nomi"), owner_id: s("Owner ID (rd_whoami)"), repo_url: s("https://github.com/user/repo"),
    branch: s("Default main"), type: s("web_service, static_site, background_worker (default web_service)"),
    runtime: s("node, python, docker... (default node)"), plan: s("free, starter... (default free)"), region: s("oregon, frankfurt... (default oregon)"),
    build_command: s("Masalan npm install"), start_command: s("Masalan node index.js"),
    env_vars: { type: "array", items: { type: "object" }, description: "[{key,value}]" },
    extra: o("Qo'shimcha maydonlar (to'g'ridan-to'g'ri Render tanasiga qo'shiladi)"), confirm: confirmP,
  }, ["name", "owner_id", "repo_url"]),
  ptool("rd_deploy", rdT, "Servisni qayta deploy qilish", { service_id: rdSvc, clear_cache: { type: "boolean", description: "Cache'ni tozalash" } }, ["service_id"]),
  ptool("rd_list_deploys", rdT, "Servis deploy'lari tarixi", { service_id: rdSvc, limit: n("1-100") }, ["service_id"]),
  ptool("rd_restart", rdT, "Servisni restart qilish", { service_id: rdSvc }, ["service_id"]),
  ptool("rd_suspend", rdT, "Servisni to'xtatish (suspend)", { service_id: rdSvc }, ["service_id"]),
  ptool("rd_resume", rdT, "To'xtatilgan servisni qayta yoqish", { service_id: rdSvc }, ["service_id"]),
  ptool("rd_list_env", rdT, "Servis env o'zgaruvchilari", { service_id: rdSvc }, ["service_id"]),
  ptool("rd_set_env", rdT, "Env o'zgaruvchi qo'shish/yangilash", { service_id: rdSvc, key: s("Nomi"), value: s("Qiymati") }, ["service_id", "key", "value"]),
  ptool("rd_logs", rdT, "Servis log'lari", { owner_id: s("Owner ID"), service_id: rdSvc, limit: n("1-100") }, ["owner_id", "service_id"]),
  ptool("rd_delete_service", rdT, "Servisni o'chirish (XAVFLI, tasdiq kerak)", { service_id: rdSvc, confirm: confirmP }, ["service_id"]),
  ptool("rd_api", rdT, "Istalgan Render API so'rovi. Yo'l /v1 dan keyin: /services/ID/...", { method: methodP, path: s("Masalan /services"), body: anyBody, confirm: confirmP }, ["method", "path"]),
];

async function http(base, token, method, path, body, extra = {}) {
  if (!/^\/[A-Za-z0-9_\-./%?=&:,+@~]*$/.test(path)) throw new Error("API yo'li noto'g'ri");
  const headers = { authorization: "Bearer " + token, accept: "application/json", "user-agent": "paradoks-mcp", ...extra };
  let payload;
  if (body === undefined || body === null) payload = undefined;
  else if (body instanceof Uint8Array) { payload = body; headers["content-type"] = "application/octet-stream"; }
  else if (typeof FormData !== "undefined" && body instanceof FormData) payload = body;
  else { payload = JSON.stringify(body); headers["content-type"] = "application/json"; }
  const res = await fetch(base + path, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}
function pmust(r, who) {
  const d = r.data;
  const cfFail = d && typeof d === "object" && d.success === false;
  if (!r.ok || cfFail) {
    let m = "";
    if (d && typeof d === "object") m = (d.errors && d.errors.map((e) => e.message || JSON.stringify(e)).join("; ")) || d.message || (d.error && (d.error.message || d.error)) || JSON.stringify(d);
    else m = String(d || "");
    throw new Error(`${who} ${r.status}: ${m}`);
  }
  return d;
}
async function sha1hex(bytes) {
  const c = globalThis.crypto || (await import("node:crypto")).webcrypto;
  const h = new Uint8Array(await c.subtle.digest("SHA-1", bytes));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}
const ep = encodeURIComponent;

async function runPlatform(name, a) {
  const token = a.token;
  if (!token || !PTOKEN_RE.test(token)) throw new Error("Token noto'g'ri formatda");
  let result;

  switch (name) {
    // ── Cloudflare
    case "cf_verify": result = pmust(await http(CF, token, "GET", "/user/tokens/verify"), "Cloudflare").result; break;
    case "cf_list_accounts": result = pmust(await http(CF, token, "GET", "/accounts"), "Cloudflare").result.map((x) => ({ id: x.id, name: x.name })); break;
    case "cf_list_workers": {
      const d = pmust(await http(CF, token, "GET", `/accounts/${ep(a.account_id)}/workers/scripts`), "Cloudflare");
      result = d.result.map((x) => ({ name: x.id, modified_on: x.modified_on, created_on: x.created_on }));
      break;
    }
    case "cf_get_worker_code": {
      const r = await http(CF, token, "GET", `/accounts/${ep(a.account_id)}/workers/scripts/${ep(a.name)}`);
      if (!r.ok) pmust(r, "Cloudflare");
      result = { name: a.name, code: typeof r.data === "string" ? r.data : JSON.stringify(r.data) };
      break;
    }
    case "cf_deploy_worker": {
      const meta = {
        main_module: "index.js",
        compatibility_date: a.compatibility_date || "2025-09-01",
        bindings: a.bindings || [],
      };
      if (a.compatibility_flags) meta.compatibility_flags = a.compatibility_flags;
      if (a.keep_secrets !== false) meta.keep_bindings = ["secret_text", "secret_key"];
      const fd = new FormData();
      fd.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }), "metadata.json");
      fd.append("index.js", new Blob([a.code], { type: "application/javascript+module" }), "index.js");
      const d = pmust(await http(CF, token, "PUT", `/accounts/${ep(a.account_id)}/workers/scripts/${ep(a.name)}`, fd), "Cloudflare");
      result = { name: a.name, deployed: true, modified_on: d.result?.modified_on };
      try {
        await http(CF, token, "POST", `/accounts/${ep(a.account_id)}/workers/scripts/${ep(a.name)}/subdomain`, { enabled: true, previews_enabled: false });
        const sd = await http(CF, token, "GET", `/accounts/${ep(a.account_id)}/workers/subdomain`);
        const sub = sd.data?.result?.subdomain;
        if (sub) result.url = `https://${a.name}.${sub}.workers.dev`;
        else result.note = "workers.dev subdomain hali yo'q. Dashboard > Workers'da bir marta tanlang.";
      } catch { result.note = "Deploy bo'ldi, lekin workers.dev manzilini aniqlay olmadim."; }
      break;
    }
    case "cf_set_secret": {
      pmust(await http(CF, token, "PUT", `/accounts/${ep(a.account_id)}/workers/scripts/${ep(a.name)}/secrets`, { name: a.secret_name, text: a.secret_value, type: "secret_text" }), "Cloudflare");
      result = { ok: true, worker: a.name, secret: a.secret_name };
      break;
    }
    case "cf_delete_worker": {
      needConfirm(a, `"${a.name}" Worker'i butunlay o'chiriladi`);
      pmust(await http(CF, token, "DELETE", `/accounts/${ep(a.account_id)}/workers/scripts/${ep(a.name)}`), "Cloudflare");
      result = { deleted: a.name };
      break;
    }
    case "cf_api": case "nl_api": case "rd_api": {
      const m = String(a.method || "").toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(m)) throw new Error("Method noto'g'ri");
      if (m === "DELETE") needConfirm(a, "DELETE so'rovi ma'lumotni o'chiradi");
      const base = name === "cf_api" ? CF : name === "nl_api" ? NL : RD;
      const x = await http(base, token, m, String(a.path || ""), a.body);
      result = { status: x.status, data: x.data };
      if (!x.ok) return finishP(result, token, true);
      break;
    }

    // ── Netlify
    case "nl_whoami": {
      const u = pmust(await http(NL, token, "GET", "/user"), "Netlify");
      const acc = await http(NL, token, "GET", "/accounts");
      result = { email: u.email, full_name: u.full_name, accounts: Array.isArray(acc.data) ? acc.data.map((x) => ({ slug: x.slug, name: x.name })) : [] };
      break;
    }
    case "nl_list_sites": {
      const pp = Math.min(Math.max(a.per_page || 30, 1), 100);
      const d = pmust(await http(NL, token, "GET", `/sites?per_page=${pp}`), "Netlify");
      result = d.map((x) => ({ id: x.id, name: x.name, url: x.ssl_url || x.url, repo: x.build_settings?.repo_url, updated_at: x.updated_at }));
      break;
    }
    case "nl_create_site": {
      const p = a.account_slug ? `/${ep(a.account_slug)}/sites` : "/sites";
      const d = pmust(await http(NL, token, "POST", p, a.name ? { name: a.name } : {}), "Netlify");
      result = { id: d.id, name: d.name, url: d.ssl_url || d.url };
      break;
    }
    case "nl_deploy_files": {
      const files = Array.isArray(a.files) ? a.files : [];
      if (!files.length) throw new Error("files bo'sh");
      const items = [];
      for (const f of files) {
        const bytes = _enc.encode(String(f.content));
        items.push({ path: "/" + String(f.path).replace(/^\/+/, ""), bytes, sha: await sha1hex(bytes) });
      }
      const digest = Object.fromEntries(items.map((i) => [i.path, i.sha]));
      const dep = pmust(await http(NL, token, "POST", `/sites/${ep(a.site_id)}/deploys`, { files: digest }), "Netlify");
      const need = new Set(dep.required || []);
      for (const i of items) {
        if (!need.has(i.sha)) continue;
        const up = await http(NL, token, "PUT", `/deploys/${ep(dep.id)}/files${i.path.split("/").map(ep).join("/")}`, i.bytes);
        if (!up.ok) pmust(up, "Netlify");
      }
      const fin = await http(NL, token, "GET", `/deploys/${ep(dep.id)}`);
      result = { deploy_id: dep.id, state: fin.data?.state, url: fin.data?.ssl_url || fin.data?.deploy_ssl_url, uploaded: items.filter((i) => need.has(i.sha)).length, total: items.length };
      break;
    }
    case "nl_list_deploys": {
      const pp = Math.min(Math.max(a.per_page || 10, 1), 100);
      const d = pmust(await http(NL, token, "GET", `/sites/${ep(a.site_id)}/deploys?per_page=${pp}`), "Netlify");
      result = d.map((x) => ({ id: x.id, state: x.state, created_at: x.created_at, branch: x.branch, commit: x.commit_ref, title: x.title, error: x.error_message }));
      break;
    }
    case "nl_get_deploy": {
      const x = pmust(await http(NL, token, "GET", `/deploys/${ep(a.deploy_id)}`), "Netlify");
      result = { id: x.id, state: x.state, error: x.error_message, url: x.ssl_url, deploy_url: x.deploy_ssl_url, created_at: x.created_at };
      break;
    }
    case "nl_rollback": {
      const x = pmust(await http(NL, token, "POST", `/sites/${ep(a.site_id)}/deploys/${ep(a.deploy_id)}/restore`, {}), "Netlify");
      result = { restored: x.id, state: x.state };
      break;
    }
    case "nl_trigger_build": {
      const x = pmust(await http(NL, token, "POST", `/sites/${ep(a.site_id)}/builds`, {}), "Netlify");
      result = { build_id: x.id, deploy_id: x.deploy_id };
      break;
    }
    case "nl_list_env": {
      const d = pmust(await http(NL, token, "GET", `/accounts/${ep(a.account_slug)}/env?site_id=${ep(a.site_id)}`), "Netlify");
      result = d.map((x) => ({ key: x.key, scopes: x.scopes, is_secret: x.is_secret }));
      break;
    }
    case "nl_set_env": {
      const body = [{ key: a.key, scopes: ["builds", "functions", "runtime"], values: [{ value: a.value, context: "all" }] }];
      const d = pmust(await http(NL, token, "POST", `/accounts/${ep(a.account_slug)}/env?site_id=${ep(a.site_id)}`, body), "Netlify");
      result = { ok: true, key: a.key, response: d };
      break;
    }
    case "nl_delete_site": {
      needConfirm(a, `${a.site_id} saytini butunlay o'chirish`);
      pmust(await http(NL, token, "DELETE", `/sites/${ep(a.site_id)}`), "Netlify");
      result = { deleted: a.site_id };
      break;
    }

    // ── Render
    case "rd_whoami": {
      const d = pmust(await http(RD, token, "GET", "/owners?limit=20"), "Render");
      result = d.map((x) => ({ owner_id: x.owner?.id, name: x.owner?.name, email: x.owner?.email, type: x.owner?.type }));
      break;
    }
    case "rd_list_services": {
      const lim = Math.min(Math.max(a.limit || 30, 1), 100);
      const d = pmust(await http(RD, token, "GET", `/services?limit=${lim}`), "Render");
      result = d.map((x) => ({ id: x.service?.id, name: x.service?.name, type: x.service?.type, suspended: x.service?.suspended, url: x.service?.serviceDetails?.url, repo: x.service?.repo, updated_at: x.service?.updatedAt }));
      break;
    }
    case "rd_create_service": {
      const plan = a.plan || "free";
      if (plan !== "free") needConfirm(a, `"${plan}" reja pullik bo'lishi mumkin`);
      const body = {
        type: a.type || "web_service", name: a.name, ownerId: a.owner_id, repo: a.repo_url,
        branch: a.branch || "main", autoDeploy: "yes",
        serviceDetails: {
          runtime: a.runtime || "node", plan, region: a.region || "oregon",
          envSpecificDetails: { buildCommand: a.build_command, startCommand: a.start_command },
        },
        ...(a.env_vars ? { envVars: a.env_vars } : {}),
        ...(a.extra || {}),
      };
      const d = pmust(await http(RD, token, "POST", "/services", body), "Render");
      result = { id: d.service?.id, name: d.service?.name, url: d.service?.serviceDetails?.url, deploy_id: d.deployId };
      break;
    }
    case "rd_deploy": {
      const d = pmust(await http(RD, token, "POST", `/services/${ep(a.service_id)}/deploys`, { clearCache: a.clear_cache ? "clear" : "do_not_clear" }), "Render");
      result = { deploy_id: d.id, status: d.status };
      break;
    }
    case "rd_list_deploys": {
      const lim = Math.min(Math.max(a.limit || 10, 1), 100);
      const d = pmust(await http(RD, token, "GET", `/services/${ep(a.service_id)}/deploys?limit=${lim}`), "Render");
      result = d.map((x) => ({ id: x.deploy?.id, status: x.deploy?.status, created_at: x.deploy?.createdAt, commit: x.deploy?.commit?.message }));
      break;
    }
    case "rd_restart": pmust(await http(RD, token, "POST", `/services/${ep(a.service_id)}/restart`, {}), "Render"); result = { restarting: a.service_id }; break;
    case "rd_suspend": pmust(await http(RD, token, "POST", `/services/${ep(a.service_id)}/suspend`, {}), "Render"); result = { suspended: a.service_id }; break;
    case "rd_resume": pmust(await http(RD, token, "POST", `/services/${ep(a.service_id)}/resume`, {}), "Render"); result = { resumed: a.service_id }; break;
    case "rd_list_env": {
      const d = pmust(await http(RD, token, "GET", `/services/${ep(a.service_id)}/env-vars`), "Render");
      result = d.map((x) => ({ key: x.envVar?.key, value: x.envVar?.value ? "(bor)" : "(bo'sh)" }));
      break;
    }
    case "rd_set_env": {
      pmust(await http(RD, token, "PUT", `/services/${ep(a.service_id)}/env-vars/${ep(a.key)}`, { value: a.value }), "Render");
      result = { ok: true, key: a.key };
      break;
    }
    case "rd_logs": {
      const lim = Math.min(Math.max(a.limit || 50, 1), 100);
      const d = pmust(await http(RD, token, "GET", `/logs?ownerId=${ep(a.owner_id)}&resource=${ep(a.service_id)}&limit=${lim}`), "Render");
      result = (d.logs || []).map((l) => `${l.timestamp} ${l.message}`);
      break;
    }
    case "rd_delete_service": {
      needConfirm(a, `${a.service_id} servisini o'chirish`);
      pmust(await http(RD, token, "DELETE", `/services/${ep(a.service_id)}`), "Render");
      result = { deleted: a.service_id };
      break;
    }
    default:
      throw new Error("Noma'lum tool: " + name);
  }
  return finishP(result, token, false);
}
function finishP(result, token, isError) {
  let out = typeof result === "string" ? result : JSON.stringify(result, null, 1);
  out = out.split(token).join("***");
  if (out.length > MAX_OUT) out = out.slice(0, MAX_OUT) + "\n...(qirqildi)";
  return { content: [{ type: "text", text: out }], ...(isError ? { isError: true } : {}) };
}

// ───────────── GitHub tools (token har chaqiruvda beriladi, saqlanmaydi) ─────────────
const GH_TOKEN_RE = /^(ghp_|gho_|ghu_|ghs_|github_pat_)[A-Za-z0-9_]{20,}$/;
const _dec = new TextDecoder();
function b64enc(str) {
  const bytes = _enc.encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64dec(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  return _dec.decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
const cp = (p) => String(p || "").replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");

function ghTool(name, description, props = {}, required = []) {
  return {
    name, gh: true, description,
    inputSchema: {
      type: "object",
      properties: { token: s("GitHub token (fine-grained PAT yoki ghp_...)"), ...props },
      required: ["token", ...required],
    },
  };
}
const gOwner = s("Repo egasi (username yoki tashkilot)");
const gRepo = s("Repo nomi");
const gPath = s("Fayl yoki papka yo'li, masalan src/index.js");
const gBranch = s("Branch (bo'sh bo'lsa default branch)");

const GH_TOOLS = [
  ghTool("gh_whoami", "GitHub token kimniki ekanini ko'rsatadi (tekshirish uchun)"),
  ghTool("gh_list_repos", "Foydalanuvchining repolari ro'yxati (oxirgi yangilanish bo'yicha)", {
    per_page: n("Nechta repo (1-100, default 30)"),
  }),
  ghTool("gh_create_repo", "Yangi repo yaratish", {
    name: s("Repo nomi"), description: s("Tavsif"),
    private: { type: "boolean", description: "Private bo'lsinmi (default false)" },
  }, ["name"]),
  ghTool("gh_list_dir", "Repo papkasidagi fayllar ro'yxati (path bo'sh = ildiz)", {
    owner: gOwner, repo: gRepo, path: gPath, ref: gBranch,
  }, ["owner", "repo"]),
  ghTool("gh_get_file", "Repodagi fayl matnini o'qish", {
    owner: gOwner, repo: gRepo, path: gPath, ref: gBranch,
  }, ["owner", "repo", "path"]),
  ghTool("gh_put_file", "Bitta faylni yaratish yoki yangilash (commit qiladi). Mavjud bo'lsa sha ni o'zi topadi", {
    owner: gOwner, repo: gRepo, path: gPath, content: s("Fayl matni (UTF-8)"),
    message: s("Commit xabari"), branch: gBranch,
  }, ["owner", "repo", "path", "content", "message"]),
  ghTool("gh_push_files", "Bir nechta faylni BITTA commit bilan yuborish (push)", {
    owner: gOwner, repo: gRepo, message: s("Commit xabari"), branch: gBranch,
    files: {
      type: "array", description: "Fayllar ro'yxati",
      items: { type: "object", properties: { path: s("Yo'l"), content: s("Matn (UTF-8)") }, required: ["path", "content"] },
    },
  }, ["owner", "repo", "message", "files"]),
  ghTool("gh_delete_file", "Faylni o'chirish (commit qiladi, tasdiq kerak)", {
    owner: gOwner, repo: gRepo, path: gPath, message: s("Commit xabari"), branch: gBranch, confirm: confirmP,
  }, ["owner", "repo", "path", "message"]),
  ghTool("gh_list_issues", "Issue'lar ro'yxati", {
    owner: gOwner, repo: gRepo, state: s("open, closed yoki all (default open)"), per_page: n("1-100"),
  }, ["owner", "repo"]),
  ghTool("gh_create_issue", "Yangi issue ochish", {
    owner: gOwner, repo: gRepo, title: s("Sarlavha"), body: s("Matn"),
    labels: { type: "array", items: { type: "string" }, description: "Label'lar" },
  }, ["owner", "repo", "title"]),
  ghTool("gh_api", "Istalgan GitHub REST API so'rovi (PR, release, workflow va boshqalar)", {
    method: s("GET, POST, PUT, PATCH yoki DELETE"),
    path: s("Masalan /repos/OWNER/REPO/pulls"),
    body: o("JSON tana (ixtiyoriy)"), confirm: confirmP,
  }, ["method", "path"]),
];

async function gh(token, method, path, body) {
  if (!/^\/[A-Za-z0-9_\-./%?=&:,+@~]*$/.test(path)) throw new Error("API yo'li noto'g'ri");
  const res = await fetch("https://api.github.com" + path, {
    method,
    headers: {
      authorization: "Bearer " + token,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "paradoks-mcp",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}
function must(r) {
  if (!r.ok) {
    const m = r.data && r.data.message ? r.data.message : JSON.stringify(r.data);
    throw new Error(`GitHub ${r.status}: ${m}`);
  }
  return r.data;
}
async function existingSha(token, o, r, path, ref) {
  const q = ref ? "?ref=" + encodeURIComponent(ref) : "";
  const x = await gh(token, "GET", `/repos/${o}/${r}/contents/${cp(path)}${q}`);
  return x.ok && x.data && !Array.isArray(x.data) ? x.data.sha : undefined;
}
async function putOne(token, o, r, path, content, message, branch) {
  const sha = await existingSha(token, o, r, path, branch);
  const body = { message, content: b64enc(content) };
  if (branch) body.branch = branch;
  if (sha) body.sha = sha;
  const d = must(await gh(token, "PUT", `/repos/${o}/${r}/contents/${cp(path)}`, body));
  return { path, action: sha ? "updated" : "created", commit: d.commit?.sha, url: d.content?.html_url };
}

async function runGithub(name, a) {
  const token = a.token;
  if (!token || !GH_TOKEN_RE.test(token)) throw new Error("GitHub token noto'g'ri formatda (ghp_... yoki github_pat_...)");
  const { owner: o, repo: r } = a;
  let result;

  switch (name) {
    case "gh_whoami": {
      const d = must(await gh(token, "GET", "/user"));
      result = { login: d.login, name: d.name, id: d.id, url: d.html_url, public_repos: d.public_repos };
      break;
    }
    case "gh_list_repos": {
      const pp = Math.min(Math.max(a.per_page || 30, 1), 100);
      const d = must(await gh(token, "GET", `/user/repos?per_page=${pp}&sort=updated`));
      result = d.map((x) => ({ full_name: x.full_name, private: x.private, default_branch: x.default_branch, updated_at: x.updated_at, url: x.html_url }));
      break;
    }
    case "gh_create_repo": {
      const d = must(await gh(token, "POST", "/user/repos", {
        name: a.name, description: a.description, private: !!a.private, auto_init: true,
      }));
      result = { full_name: d.full_name, url: d.html_url, default_branch: d.default_branch };
      break;
    }
    case "gh_list_dir": {
      const q = a.ref ? "?ref=" + encodeURIComponent(a.ref) : "";
      const d = must(await gh(token, "GET", `/repos/${o}/${r}/contents/${cp(a.path)}${q}`));
      result = Array.isArray(d) ? d.map((x) => ({ name: x.name, type: x.type, size: x.size, path: x.path })) : d;
      break;
    }
    case "gh_get_file": {
      const q = a.ref ? "?ref=" + encodeURIComponent(a.ref) : "";
      const d = must(await gh(token, "GET", `/repos/${o}/${r}/contents/${cp(a.path)}${q}`));
      if (Array.isArray(d) || d.type !== "file") throw new Error("Bu fayl emas (papka yoki submodule). gh_list_dir ishlating.");
      if (!d.content) throw new Error("Fayl juda katta (>1MB), gh_api bilan raw oling.");
      result = { path: d.path, sha: d.sha, size: d.size, content: b64dec(d.content) };
      break;
    }
    case "gh_put_file":
      result = await putOne(token, o, r, a.path, a.content, a.message, a.branch);
      break;
    case "gh_push_files": {
      const files = Array.isArray(a.files) ? a.files : [];
      if (!files.length) throw new Error("files bo'sh");
      const repoInfo = must(await gh(token, "GET", `/repos/${o}/${r}`));
      const branch = a.branch || repoInfo.default_branch || "main";
      const ref = await gh(token, "GET", `/repos/${o}/${r}/git/ref/heads/${encodeURIComponent(branch)}`);
      if (!ref.ok) {
        // bo'sh repo yoki yangi branch: fayllarni ketma-ket yuboramiz
        const done = [];
        for (const f of files) done.push(await putOne(token, o, r, f.path, f.content, a.message, a.branch));
        result = { mode: "sequential", files: done };
        break;
      }
      const baseSha = ref.data.object.sha;
      const baseCommit = must(await gh(token, "GET", `/repos/${o}/${r}/git/commits/${baseSha}`));
      const blobs = await Promise.all(files.map(async (f) => {
        const b = must(await gh(token, "POST", `/repos/${o}/${r}/git/blobs`, { content: String(f.content), encoding: "utf-8" }));
        return { path: String(f.path).replace(/^\/+/, ""), mode: "100644", type: "blob", sha: b.sha };
      }));
      const tree = must(await gh(token, "POST", `/repos/${o}/${r}/git/trees`, { base_tree: baseCommit.tree.sha, tree: blobs }));
      const commit = must(await gh(token, "POST", `/repos/${o}/${r}/git/commits`, { message: a.message, tree: tree.sha, parents: [baseSha] }));
      must(await gh(token, "PATCH", `/repos/${o}/${r}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha }));
      result = { mode: "single-commit", branch, commit: commit.sha, files: blobs.map((b) => b.path) };
      break;
    }
    case "gh_delete_file": {
      needConfirm(a, `${a.path} fayli o'chiriladi`);
      const sha = await existingSha(token, o, r, a.path, a.branch);
      if (!sha) throw new Error("Fayl topilmadi");
      const body = { message: a.message, sha };
      if (a.branch) body.branch = a.branch;
      const d = must(await gh(token, "DELETE", `/repos/${o}/${r}/contents/${cp(a.path)}`, body));
      result = { deleted: a.path, commit: d.commit?.sha };
      break;
    }
    case "gh_list_issues": {
      const st = ["open", "closed", "all"].includes(a.state) ? a.state : "open";
      const pp = Math.min(Math.max(a.per_page || 30, 1), 100);
      const d = must(await gh(token, "GET", `/repos/${o}/${r}/issues?state=${st}&per_page=${pp}`));
      result = d.map((x) => ({ number: x.number, title: x.title, state: x.state, user: x.user?.login, pr: !!x.pull_request, url: x.html_url }));
      break;
    }
    case "gh_create_issue": {
      const d = must(await gh(token, "POST", `/repos/${o}/${r}/issues`, { title: a.title, body: a.body, labels: a.labels }));
      result = { number: d.number, url: d.html_url };
      break;
    }
    case "gh_api": {
      const m = String(a.method || "").toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(m)) throw new Error("Method noto'g'ri");
      if (m === "DELETE") needConfirm(a, "DELETE so'rovi ma'lumotni o'chiradi");
      const x = await gh(token, m, String(a.path || ""), a.body);
      result = { status: x.status, data: x.data };
      if (!x.ok) {
        let t = JSON.stringify(result).split(token).join("***");
        return { content: [{ type: "text", text: t.slice(0, MAX_OUT) }], isError: true };
      }
      break;
    }
    default:
      throw new Error("Noma'lum tool: " + name);
  }
  let out = JSON.stringify(result, null, 1).split(token).join("***");
  if (out.length > MAX_OUT) out = out.slice(0, MAX_OUT) + "\n...(qirqildi)";
  return { content: [{ type: "text", text: out }] };
}

const PUBLIC_TOOLS = [...TOOLS, ...GH_TOOLS, ...P_TOOLS].map(({ method, gh, plat, ...rest }) => rest);

async function runTool(name, args = {}) {
  if (typeof name === "string" && name.startsWith("gh_")) return runGithub(name, args);
  if (typeof name === "string" && /^(cf|nl|rd)_/.test(name)) return runPlatform(name, args);
  const t = BY_NAME[name];
  if (!t) throw new Error("Noma'lum tool: " + name);
  const { token, ...rest } = args;
  if (!token || !TOKEN_RE.test(token)) throw new Error("Token noto'g'ri formatda");

  let method = t.method;
  let body = rest;
  if (name === "call_api") {
    method = String(rest.method || "");
    if (!/^[A-Za-z]{3,40}$/.test(method)) throw new Error("Metod nomi noto'g'ri");
    body = rest.params || {};
  }
  if (name === "get_updates") body = { timeout: 0, ...rest };

  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let out = await res.text();
  out = out.split(token).join("***");
  if (out.length > MAX_OUT) out = out.slice(0, MAX_OUT) + "\n...(qirqildi)";
  return { content: [{ type: "text", text: out }], isError: !res.ok };
}

async function handleRpc(msg) {
  const { id, method, params } = msg;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const err = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (id === undefined) return null; // notification

  try {
    switch (method) {
      case "initialize":
        return ok({
          protocolVersion: params?.protocolVersion || "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "paradoks-mcp", version: "0.3.0" },
        });
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: PUBLIC_TOOLS });
      case "tools/call":
        try {
          return ok(await runTool(params?.name, params?.arguments));
        } catch (e) {
          return ok({ content: [{ type: "text", text: String(e.message) }], isError: true });
        }
      default:
        return err(-32601, "Method not found: " + method);
    }
  } catch (e) {
    return err(-32603, "Internal error");
  }
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, authorization",
};

const PAGE = `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paradoks MCP</title>
<meta name="description" content="Claude chatidan Telegram bot orqali xabar yuborish, tahrirlash va guruhlarni boshqarish uchun MCP connector.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;800&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<style>
:root{
  --paper:#EEF3F7; --card:#FFFFFF; --ink:#10202E; --muted:#51657A;
  --line:#CBD8E3; --accent:#1B7FB8; --accent-ink:#FFFFFF; --warn-bg:#FBF0D3; --warn-ink:#5A4300;
  color-scheme: light;
}
@media (prefers-color-scheme: dark){
  :root{--paper:#0E1822; --card:#15242F; --ink:#E6EEF5; --muted:#93A8BA; --line:#27394A;
    --accent:#4FB3E8; --accent-ink:#06121B; --warn-bg:#3A2F10; --warn-ink:#F3DFA5; color-scheme: dark;}
}
*{box-sizing:border-box}
html{scroll-padding-top:16px}
body{margin:0;background:var(--paper);color:var(--ink);font:400 17px/1.6 "IBM Plex Sans",system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:56px 20px 72px}
h1,h2{font-family:"Bricolage Grotesque","IBM Plex Sans",system-ui,sans-serif;line-height:1.08;letter-spacing:-.02em;margin:0}
h1{font-weight:800;font-size:clamp(2.2rem,7vw,3.4rem)}
h2{font-weight:600;font-size:1.5rem;margin-bottom:14px}
.lead{color:var(--muted);max-width:56ch;margin:16px 0 28px}
.urlbox{display:flex;gap:8px;background:var(--card);border:2px solid var(--ink);border-radius:12px;padding:8px 8px 8px 16px;align-items:center}
.urlbox code{flex:1;min-width:0;overflow-x:auto;white-space:nowrap;font:500 .95rem "IBM Plex Mono",ui-monospace,monospace;scrollbar-width:none}
button{font:500 1rem "IBM Plex Sans",system-ui,sans-serif;background:var(--accent);color:var(--accent-ink);border:0;border-radius:8px;padding:10px 18px;cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.hint{font-size:.9rem;color:var(--muted);margin:10px 2px 0}
section{margin-top:56px}
ol{list-style:none;margin:0;padding:0;counter-reset:s}
ol li{counter-increment:s;position:relative;padding:0 0 28px 56px;border-left:2px solid var(--line);margin-left:18px}
ol li:last-child{border-color:transparent;padding-bottom:0}
ol li::before{content:counter(s);position:absolute;left:-19px;top:-2px;width:36px;height:36px;border-radius:50%;background:var(--ink);color:var(--paper);display:grid;place-items:center;font:600 1rem "Bricolage Grotesque",sans-serif}
ol h3{margin:0 0 4px;font-size:1.1rem}
ol p{margin:0;color:var(--muted)}
.ex{margin-top:10px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;font:500 .92rem/1.5 "IBM Plex Mono",monospace;overflow-wrap:anywhere}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.chips li{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:4px 14px;font:500 .88rem "IBM Plex Mono",monospace}
.warn{background:var(--warn-bg);color:var(--warn-ink);border-radius:12px;padding:20px 22px}
.warn h2{font-size:1.2rem;margin-bottom:8px}
.warn ul{margin:0;padding-left:20px}
.warn li+li{margin-top:6px}
footer{margin-top:56px;color:var(--muted);font-size:.9rem}
footer a{color:var(--accent)}
@media (prefers-reduced-motion:no-preference){button{transition:transform .1s}button:active{transform:scale(.97)}}
</style>
</head>
<body>
<main>
  <h1>Claude’ni Telegram, GitHub va hostinglarga ulang</h1>
  <p class="lead">Telegram botingizni Claude’ga ulang. Keyin chatda “guruhga bugungi hisobotni yubor” desangiz bo‘ldi: Claude xabarni o‘zi yuboradi, tahrirlaydi yoki o‘chiradi.</p>

  <div class="urlbox">
    <code id="url">/mcp</code>
    <button id="copy" type="button">Nusxalash</button>
  </div>
  <p class="hint">Bu connector manzili. Quyidagi 3 qadamda Claude’ga qo‘shasiz.</p>

  <section>
    <h2>Ulash</h2>
    <ol>
      <li>
        <h3>Bot yarating va tokenni oling</h3>
        <p>Telegram’da <b>@BotFather</b> ga o‘ting, <b>/newbot</b> yozing va ko‘rsatmalarga amal qiling. Oxirida token beradi.</p>
        <div class="ex">123456789:AAH-namuna-token-uzun-qator</div>
      </li>
      <li>
        <h3>Connector’ni qo‘shing</h3>
        <p>Claude ilovasida Sozlamalar → Connectors bo‘limida custom connector qo‘shing va yuqoridagi manzilni kiriting.</p>
      </li>
      <li>
        <h3>Tokenni chatda yuboring</h3>
        <p>Claude’ga tokenni yozing va nima qilishni ayting. Avval tekshirib ko‘ring:</p>
        <div class="ex">Shu bot tokenini get_me bilan tekshir: 123456789:AAH...</div>
      </li>
    </ol>
  </section>

  <section>
    <h2>Claude nima qila oladi</h2>
    <ul class="chips">
      <li>send_message</li><li>send_photo</li><li>send_document</li>
      <li>edit_message_text</li><li>delete_message</li><li>forward_message</li>
      <li>pin_chat_message</li><li>get_chat</li><li>get_chat_member</li>
      <li>ban_chat_member</li><li>get_updates</li><li>set_webhook</li>
      <li>call_api</li>
    </ul>
    <p class="hint">call_api orqali Telegram Bot API’ning istalgan metodini (so‘rovnoma, forum mavzusi va boshqalar) chaqirish mumkin.</p>
  </section>

  <section>
    <h2>GitHub ham ulangan</h2>
    <p class="lead" style="margin-top:0">Claude repolaringizni o‘qiy oladi, fayl yozadi, bir nechta faylni bitta commit bilan push qiladi, issue ochadi. Buning uchun GitHub token kerak.</p>
    <ol>
      <li>
        <h3>Token yarating</h3>
        <p>GitHub → Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b>. Faqat kerakli repoga ruxsat bering: <b>Contents: Read and write</b>, issue uchun <b>Issues: Read and write</b>.</p>
      </li>
      <li>
        <h3>Chatda yuboring</h3>
        <div class="ex">Shu token bilan gh_whoami ni ishlat: github_pat_...</div>
      </li>
    </ol>
    <ul class="chips" style="margin-top:18px">
      <li>gh_list_repos</li><li>gh_get_file</li><li>gh_put_file</li><li>gh_push_files</li>
      <li>gh_delete_file</li><li>gh_create_repo</li><li>gh_create_issue</li><li>gh_api</li>
    </ul>
  </section>

  <section>
    <h2>Cloudflare, Netlify, Render</h2>
    <p class="lead" style="margin-top:0">Claude yangi Worker yaratib deploy qiladi, Netlify’ga sayt chiqaradi, Render’da servislarni boshqaradi. Har platforma uchun o‘z tokeningiz kerak.</p>
    <ul class="chips">
      <li>cf_deploy_worker</li><li>cf_set_secret</li><li>cf_api</li>
      <li>nl_deploy_files</li><li>nl_rollback</li><li>nl_set_env</li>
      <li>rd_create_service</li><li>rd_deploy</li><li>rd_logs</li>
    </ul>
    <p class="hint">O‘chirish va pullik amallar oldidan Claude sizdan alohida tasdiq so‘raydi.</p>
  </section>

  <section class="warn">
    <h2>Token xavfsizligi</h2>
    <ul>
      <li>Token chat tarixida qoladi. Muhim botingizni emas, alohida bot oching.</li>
      <li>GitHub uchun faqat kerakli repoga ruxsat beradigan fine-grained token oling, hamma repoga emas.</li>
      <li>Server tokenni saqlamaydi va log’ga yozmaydi: u faqat Telegram’ga so‘rov yuborish uchun ishlatiladi.</li>
      <li>Ishlatib bo‘lgach, BotFather’da <b>/revoke</b> qiling, GitHub tokenini esa Settings’da o‘chiring.</li>
    </ul>
  </section>

  <footer>
    Ochiq kod: <a href="https://github.com/YOUR-USERNAME/telegram-mcp">github.com/YOUR-USERNAME/telegram-mcp</a>
  </footer>
</main>
<script>
document.getElementById('url').textContent = location.origin + '/mcp';
document.getElementById('copy').addEventListener('click', async function(){
  var b=this, t=document.getElementById('url').textContent;
  try{ await navigator.clipboard.writeText(t); b.textContent='Nusxalandi'; }
  catch(e){ b.textContent='Qo‘lda belgilang'; }
  setTimeout(function(){ b.textContent='Nusxalash'; }, 1800);
});
</script>
</body>
</html>
`;

export default async (request) => {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (url.pathname === "/mcp") {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });
    let payload;
    try { payload = await request.json(); }
    catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS }); }

    const batch = Array.isArray(payload);
    const results = (await Promise.all((batch ? payload : [payload]).map(handleRpc))).filter(Boolean);
    if (!results.length) return new Response(null, { status: 202, headers: CORS });
    return Response.json(batch ? results : results[0], { headers: CORS });
  }

  return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
};

export const config = { path: ["/", "/mcp"] };
