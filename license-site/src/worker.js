import ADMIN_HTML from "./admin.html";

const KEY_PREFIX = "key:";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function randomKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return `WIZOX-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}-${chars.slice(12, 16)}`;
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const header = request.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Compare hashes so the check takes the same time whatever the input.
  const [a, b] = await Promise.all([sha256(given), sha256(env.ADMIN_PASSWORD)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function getKey(env, key) {
  return env.KEYS.get(KEY_PREFIX + key, "json");
}

async function putKey(env, record) {
  await env.KEYS.put(KEY_PREFIX + record.key, JSON.stringify(record));
}

async function listKeys(env) {
  const records = [];
  let cursor;
  do {
    const page = await env.KEYS.list({ prefix: KEY_PREFIX, cursor });
    const values = await Promise.all(page.keys.map((k) => env.KEYS.get(k.name, "json")));
    records.push(...values.filter(Boolean));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return records.sort((a, b) => b.createdAt - a.createdAt);
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// Called by the client: { key, hwid } -> { valid, reason?, expiresAt? }
async function verify(request, env) {
  const { key, hwid } = await readBody(request);
  if (typeof key !== "string" || !key) return json({ valid: false, reason: "missing_key" }, 400);

  const record = await getKey(env, key.trim().toUpperCase());
  if (!record) return json({ valid: false, reason: "invalid_key" });
  if (record.revoked) return json({ valid: false, reason: "revoked" });

  const now = Date.now();
  // The duration starts counting the first time the key is used.
  if (!record.activatedAt) {
    record.activatedAt = now;
    if (record.days > 0) record.expiresAt = now + record.days * 86400000;
  }
  if (record.expiresAt && now > record.expiresAt) return json({ valid: false, reason: "expired" });

  if (record.hwidLock) {
    if (typeof hwid !== "string" || !hwid) return json({ valid: false, reason: "missing_hwid" }, 400);
    if (!record.hwid) {
      record.hwid = hwid;
      } else if (record.hwid !== hwid) {
      return json({ valid: false, reason: "hwid_mismatch" });
    }
  }

  record.lastUsedAt = now;
  record.uses = (record.uses || 0) + 1;
  await putKey(env, record);

  return json({ valid: true, expiresAt: record.expiresAt || null, note: record.note || "" });
}

async function adminApi(request, env, path) {
  if (!(await isAdmin(request, env))) return json({ error: "unauthorized" }, 401);

  if (path === "/api/admin/keys" && request.method === "GET") {
    return json({ keys: await listKeys(env) });
  }

  if (path === "/api/admin/keys" && request.method === "POST") {
    const body = await readBody(request);
    const count = Math.min(Math.max(parseInt(body.count, 10) || 1, 1), 100);
    const days = Math.max(parseInt(body.days, 10) || 0, 0);
    const created = [];
    for (let i = 0; i < count; i++) {
      const record = {
        key: randomKey(),
        days,
        note: String(body.note || "").slice(0, 100),
        hwidLock: body.hwidLock !== false,
        hwid: null,
        revoked: false,
        createdAt: Date.now(),
        activatedAt: null,
        expiresAt: null,
        lastUsedAt: null,
        uses: 0,
      };
      await putKey(env, record);
      created.push(record);
    }
    return json({ keys: created });
  }

  const match = path.match(/^\/api\/admin\/keys\/([A-Z0-9-]+)(?:\/(revoke|unrevoke|reset-hwid))?$/);
  if (match) {
    const [, key, action] = match;
    const record = await getKey(env, key);
    if (!record) return json({ error: "not_found" }, 404);

    if (!action && request.method === "DELETE") {
      await env.KEYS.delete(KEY_PREFIX + key);
      return json({ ok: true });
    }
    if (action && request.method === "POST") {
      if (action === "revoke") record.revoked = true;
      if (action === "unrevoke") record.revoked = false;
      if (action === "reset-hwid") record.hwid = null;
      await putKey(env, record);
      return json({ key: record });
    }
  }

  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/verify" && request.method === "POST") return verify(request, env);
    if (pathname.startsWith("/api/admin/")) return adminApi(request, env, pathname);
    if (pathname === "/" || pathname === "/admin" || pathname === "/admin/") {
      return new Response(ADMIN_HTML, {
        headers: { "content-type": "text/html; charset=utf-8", "x-frame-options": "DENY" },
      });
    }
    return json({ error: "not_found" }, 404);
  },
};
