import ADMIN_HTML from "./admin.html";

const KEY_PREFIX = "key:";

const ORDER_PREFIX = "order:";

// What each plan costs and how long its key lasts (0 days = lifetime).
const PLANS = {
  monthly: { name: "Wizox Client – Monthly", amount: 799, days: 30 },
  lifetime: { name: "Wizox Client – Lifetime", amount: 1999, days: 0 },
};

let corsOrigin = "*";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": corsOrigin,
      "access-control-allow-headers": "content-type",
    },
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

function newKeyRecord(days, note, hwidLock = true) {
  return {
    key: randomKey(),
    days,
    note: String(note || "").slice(0, 100),
    hwidLock,
    hwid: null,
    revoked: false,
    createdAt: Date.now(),
    activatedAt: null,
    expiresAt: null,
    lastUsedAt: null,
    uses: 0,
  };
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
      const record = newKeyRecord(days, body.note, body.hwidLock !== false);
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

// ----- Stripe payments -----

async function stripe(env, method, path, params) {
  const res = await fetch("https://api.stripe.com/v1" + path, {
    method,
    headers: {
      authorization: "Bearer " + env.STRIPE_SECRET_KEY,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Stripe request failed");
  return data;
}

// Website "Get Monthly / Get Lifetime" -> { url } of a Stripe checkout page.
async function createCheckout(request, env) {
  const { plan } = await readBody(request);
  const p = PLANS[plan];
  if (!p) return json({ error: "unknown_plan" }, 400);
  if (!env.STRIPE_SECRET_KEY) return json({ error: "payments_not_set_up" }, 503);

  const site = env.SITE_URL || "https://seekboosting.lol";
  const session = await stripe(env, "POST", "/checkout/sessions", {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(p.amount),
    "line_items[0][price_data][product_data][name]": p.name,
    "metadata[plan]": plan,
    success_url: `${site}/thanks.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/#pricing`,
  });
  return json({ url: session.url });
}

// Creates the key for a paid order exactly once, however many times it's called.
async function fulfill(env, session) {
  const existing = await env.KEYS.get(ORDER_PREFIX + session.id, "json");
  if (existing) return existing;
  if (session.payment_status !== "paid") return null;

  const plan = PLANS[session.metadata?.plan] ? session.metadata.plan : "monthly";
  const email = session.customer_details?.email || "";
  const record = newKeyRecord(PLANS[plan].days, `${plan} · ${email}`);
  await putKey(env, record);
  const order = { key: record.key, plan, email, paidAt: Date.now() };
  await env.KEYS.put(ORDER_PREFIX + session.id, JSON.stringify(order));
  return order;
}

// Thanks page asks for its key: ?session_id=cs_...
async function getOrder(url, env) {
  const id = url.searchParams.get("session_id") || "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json({ error: "bad_session" }, 400);
  // The webhook usually got here first; only ask Stripe if it hasn't.
  const order = (await env.KEYS.get(ORDER_PREFIX + id, "json"))
    || await fulfill(env, await stripe(env, "GET", "/checkout/sessions/" + id));
  if (!order) return json({ status: "pending" }, 202);
  return json({ status: "paid", key: order.key, plan: order.plan, email: order.email });
}

async function hmacHex(secret, text) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Stripe tells us about payments here, so keys are made even if the buyer closes the tab.
async function stripeWebhook(request, env) {
  const body = await request.text();
  const header = request.headers.get("stripe-signature") || "";
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (!env.STRIPE_WEBHOOK_SECRET || !parts.t || !parts.v1) return json({ error: "bad_signature" }, 400);
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return json({ error: "too_old" }, 400);
  const expected = await hmacHex(env.STRIPE_WEBHOOK_SECRET, `${parts.t}.${body}`);
  if (expected !== parts.v1) return json({ error: "bad_signature" }, 400);

  const event = JSON.parse(body);
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    await fulfill(env, event.data.object);
  }
  return json({ received: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    corsOrigin = env.SITE_URL || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { "access-control-allow-origin": corsOrigin, "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST" },
      });
    }
    try {
      if (pathname === "/api/checkout" && request.method === "POST") return await createCheckout(request, env);
      if (pathname === "/api/order" && request.method === "GET") return await getOrder(url, env);
      if (pathname === "/api/stripe-webhook" && request.method === "POST") return await stripeWebhook(request, env);
    } catch (err) {
      return json({ error: err.message }, 502);
    }

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
