/* =========================================================================
   ZALTURI — site control-panel Worker (Cloudflare)

   Bindings to set in the dashboard (Worker → Settings → Bindings):
     KV namespace   -> CONFIG          (stores the site config JSON, key "site")
     R2 bucket      -> AUDIO           (the zaltiri-audio bucket, for track list)
     Secret (var)   -> ADMIN_PASSWORD  (your panel password, "Encrypt")

   Routes:
     GET  /config          public — the live site reads this (KV or {})
     POST /admin/login     { password } -> { ok }        (UX check)
     GET  /admin/tracks    Bearer <pw> -> { files:[...] } (R2 listing)
     POST /admin/save      Bearer <pw>, body=config JSON -> saves to KV
   ========================================================================= */

const ALLOWED_ORIGINS = ["https://zalturi.com", "https://www.zalturi.com"];
const R2_PREFIX = "Zalturi_tracks/";

function cors(origin) {
  const allow = ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}
function json(data, status, origin, extra) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign(
      { "Content-Type": "application/json; charset=utf-8" },
      cors(origin), extra || {}
    )
  });
}
function checkPassword(pw, env) {
  const secret = env.ADMIN_PASSWORD || "";
  if (!secret || typeof pw !== "string" || pw.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= pw.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}
function authed(request, env) {
  const h = request.headers.get("Authorization") || "";
  return checkPassword(h.replace(/^Bearer\s+/i, ""), env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });

    // ---- public: the live site reads the current config ----
    if (path === "/config" && request.method === "GET") {
      const raw = await env.CONFIG.get("site");
      return new Response(raw || "{}", {
        headers: Object.assign(
          { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=30" },
          cors(origin)
        )
      });
    }

    // ---- admin: verify the password (for the login screen) ----
    if (path === "/admin/login" && request.method === "POST") {
      let pw = "";
      try { pw = (await request.json()).password || ""; } catch (e) {}
      const ok = checkPassword(pw, env);
      return json({ ok: ok }, ok ? 200 : 401, origin);
    }

    // ---- admin: list audio files in R2 so tracks can be picked ----
    if (path === "/admin/tracks" && request.method === "GET") {
      if (!authed(request, env)) return json({ error: "unauthorized" }, 401, origin);
      const out = [];
      let cursor;
      do {
        const list = await env.AUDIO.list({ prefix: R2_PREFIX, cursor: cursor });
        for (const o of list.objects) {
          const key = o.key.slice(R2_PREFIX.length);
          if (key && /\.(mp3|wav|m4a|ogg)$/i.test(key)) out.push({ file: key, size: o.size });
        }
        cursor = list.truncated ? list.cursor : null;
      } while (cursor);
      out.sort(function (a, b) { return a.file.localeCompare(b.file); });
      return json({ files: out }, 200, origin);
    }

    // ---- admin: save the whole config to KV ----
    if (path === "/admin/save" && request.method === "POST") {
      if (!authed(request, env)) return json({ error: "unauthorized" }, 401, origin);
      let cfg;
      try { cfg = await request.json(); } catch (e) { return json({ error: "bad json" }, 400, origin); }
      if (typeof cfg !== "object" || cfg === null) return json({ error: "bad config" }, 400, origin);
      if (cfg.tracks && !Array.isArray(cfg.tracks)) return json({ error: "tracks must be an array" }, 400, origin);
      cfg.updatedAt = new Date().toISOString();
      await env.CONFIG.put("site", JSON.stringify(cfg));
      return json({ ok: true, updatedAt: cfg.updatedAt }, 200, origin);
    }

    return json({ error: "not found", path: path }, 404, origin);
  }
};
