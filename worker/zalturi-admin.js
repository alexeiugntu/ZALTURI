/* =========================================================================
   ZALTURI — site control-panel Worker (Cloudflare)

   Bindings to set in the dashboard (Worker → Settings → Bindings):
     KV namespace   -> CONFIG          (stores the site config JSON, key "site")
     R2 bucket      -> AUDIO           (the zaltiri-audio bucket, for track list)
     Secret (var)   -> ADMIN_PASSWORD  (your panel password, "Encrypt")

   Routes:
     GET  /config           public — the live site reads this (KV or {})
     POST /hit               public — one pageview beacon (deduped per IP+day)
     POST /hit-download      public — { file } -> +1 download count for that track
     POST /admin/login       { password } -> { ok }        (UX check)
     GET  /admin/tracks      Bearer <pw> -> { files:[...] } (R2 listing)
     POST /admin/save        Bearer <pw>, body=config JSON -> saves to KV
     GET  /admin/stats       Bearer <pw> -> { days:[...], visits:{date:n}, downloads:{file:n} }
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

/* per-IP fail counter in KV — blunts password brute force on the /admin/* routes.
   KV is eventually consistent, so the cap is approximate; fine for this threat model. */
const RL_MAX = 10, RL_TTL_SECONDS = 600;
async function rateState(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const fails = parseInt((await env.CONFIG.get("rl:" + ip)) || "0", 10);
  return { ip, fails, blocked: fails >= RL_MAX };
}
async function recordFail(env, st) {
  await env.CONFIG.put("rl:" + st.ip, String(st.fails + 1), { expirationTtl: RL_TTL_SECONDS });
}

/* ---- lightweight analytics: unique daily visitors + per-track downloads ----
   KV read-modify-write isn't atomic, so concurrent hits can occasionally lose an
   increment — fine here, these are approximate counts for the site owner, not
   billing. Visits are deduped per IP per UTC day (closer to "unique visitors"
   than raw pageviews, and it naturally caps trivial refresh-spam); downloads are
   not deduped since each is a deliberate button click, not a passive page load. */
function dayKey(d) { return d.toISOString().slice(0, 10); }
async function incr(env, key) {
  const cur = parseInt((await env.CONFIG.get(key)) || "0", 10);
  await env.CONFIG.put(key, String(cur + 1));
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

    // ---- public: count a pageview (deduped per IP per day) ----
    if (path === "/hit" && request.method === "POST") {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const day = dayKey(new Date());
      const seenKey = "seen:" + day + ":" + ip;
      if (!(await env.CONFIG.get(seenKey))) {
        await env.CONFIG.put(seenKey, "1", { expirationTtl: 90000 }); // ~25h, covers the UTC day in any timezone
        await incr(env, "visits:" + day);
      }
      return json({ ok: true }, 200, origin);
    }

    // ---- public: count a track download ----
    if (path === "/hit-download" && request.method === "POST") {
      let file = "";
      try { file = (await request.json()).file || ""; } catch (e) {}
      file = String(file).slice(0, 300);
      if (!file) return json({ error: "missing file" }, 400, origin);
      await incr(env, "dl:" + file);
      return json({ ok: true }, 200, origin);
    }

    // ---- admin: verify the password (for the login screen) ----
    if (path === "/admin/login" && request.method === "POST") {
      const rl = await rateState(request, env);
      if (rl.blocked) return json({ error: "too many attempts" }, 429, origin);
      let pw = "";
      try { pw = (await request.json()).password || ""; } catch (e) {}
      const ok = checkPassword(pw, env);
      if (ok) await env.CONFIG.delete("rl:" + rl.ip);
      else await recordFail(env, rl);
      return json({ ok: ok }, ok ? 200 : 401, origin);
    }

    // ---- admin: list audio files in R2 so tracks can be picked ----
    if (path === "/admin/tracks" && request.method === "GET") {
      const rlT = await rateState(request, env);
      if (rlT.blocked) return json({ error: "too many attempts" }, 429, origin);
      if (!authed(request, env)) { await recordFail(env, rlT); return json({ error: "unauthorized" }, 401, origin); }
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
      const rlS = await rateState(request, env);
      if (rlS.blocked) return json({ error: "too many attempts" }, 429, origin);
      if (!authed(request, env)) { await recordFail(env, rlS); return json({ error: "unauthorized" }, 401, origin); }
      let cfg;
      try { cfg = await request.json(); } catch (e) { return json({ error: "bad json" }, 400, origin); }
      if (typeof cfg !== "object" || cfg === null) return json({ error: "bad config" }, 400, origin);
      if (cfg.tracks && !Array.isArray(cfg.tracks)) return json({ error: "tracks must be an array" }, 400, origin);
      cfg.updatedAt = new Date().toISOString();
      await env.CONFIG.put("site", JSON.stringify(cfg));
      return json({ ok: true, updatedAt: cfg.updatedAt }, 200, origin);
    }

    // ---- admin: last 30 days of visits + all-time per-track download counts ----
    if (path === "/admin/stats" && request.method === "GET") {
      const rlA = await rateState(request, env);
      if (rlA.blocked) return json({ error: "too many attempts" }, 429, origin);
      if (!authed(request, env)) { await recordFail(env, rlA); return json({ error: "unauthorized" }, 401, origin); }

      const now = Date.now();
      const days = [];
      for (let i = 29; i >= 0; i--) days.push(dayKey(new Date(now - i * 86400000)));
      const visits = {};
      await Promise.all(days.map(async (d) => {
        visits[d] = parseInt((await env.CONFIG.get("visits:" + d)) || "0", 10);
      }));

      const downloads = {};
      let cursor;
      do {
        const list = await env.CONFIG.list({ prefix: "dl:", cursor });
        await Promise.all(list.keys.map(async (k) => {
          downloads[k.name.slice(3)] = parseInt((await env.CONFIG.get(k.name)) || "0", 10);
        }));
        cursor = list.list_complete ? null : list.cursor;
      } while (cursor);

      return json({ days: days, visits: visits, downloads: downloads }, 200, origin);
    }

    return json({ error: "not found", path: path }, 404, origin);
  }
};
