/* ZALTURI control panel — talks to the Cloudflare worker (config + R2 list + save) */
(function () {
  "use strict";
  var API = "https://zalturi-admin.zalturi.workers.dev";
  var R2_BASE = "https://audio.zalturi.com/Zalturi_tracks/";
  var pw = sessionStorage.getItem("zalturiAdminPw") || "";
  var files = [];
  var cfg = { tracks: [], radio: {}, content: {} };
  var stats = { days: [], visits: {}, downloads: {} };

  function $(id) { return document.getElementById(id); }
  function status(msg, kind) { var s = $("status"); s.textContent = msg || ""; s.className = kind || ""; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function auth() { return { "Authorization": "Bearer " + pw }; }

  /* ---- login ---- */
  function showEditor() { $("login").hidden = true; $("editor").hidden = false; }
  function doLogin(candidate) {
    return fetch(API + "/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: candidate })
    }).then(function (r) { return r.ok; });
  }
  $("loginBtn").addEventListener("click", function () {
    var v = $("pw").value; if (!v) return;
    $("loginMsg").textContent = "checking…";
    doLogin(v).then(function (ok) {
      if (ok) { pw = v; sessionStorage.setItem("zalturiAdminPw", v); $("loginMsg").textContent = ""; showEditor(); loadAll(); }
      else $("loginMsg").textContent = "wrong password";
    }).catch(function () { $("loginMsg").textContent = "network error"; });
  });
  $("pw").addEventListener("keydown", function (e) { if (e.key === "Enter") $("loginBtn").click(); });

  /* ---- load ---- */
  function loadFiles() {
    return fetch(API + "/admin/tracks", { headers: auth() })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { files = j.files || []; });
  }
  function loadConfig() {
    return fetch(API + "/config", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
      cfg = (j && typeof j === "object") ? j : {};
      cfg.tracks = Array.isArray(cfg.tracks) ? cfg.tracks : [];
      cfg.radio = cfg.radio || {}; cfg.content = cfg.content || {};
    });
  }
  function loadStats() {
    return fetch(API + "/admin/stats", { headers: auth() })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) {
        stats.days = Array.isArray(j.days) ? j.days : [];
        stats.visits = j.visits || {};
        stats.downloads = j.downloads || {};
      });
  }
  function loadAll() {
    status("loading…");
    var core = Promise.all([loadConfig(), loadFiles()]).then(function () {
      renderPlaylist(); renderRadio(); renderTexts();
    });
    // stats are supplementary — a failed/slow stats fetch must not block the
    // rest of the panel (playlist editing works even if analytics don't load)
    var statsReady = loadStats().catch(function () {
      stats = { days: [], visits: {}, downloads: {} };
    });
    Promise.all([core, statsReady]).then(function () {
      renderStats();
      status("loaded", "ok");
    }).catch(function () { status("load failed — re-login?", "err"); });
  }

  /* ---- playlist ---- */
  function fileOptions(selected) {
    var opts = '<option value="">— pick file —</option>', seen = false;
    files.forEach(function (f) {
      var s = f.file === selected; if (s) seen = true;
      opts += '<option value="' + esc(f.file) + '"' + (s ? " selected" : "") + '>' + esc(f.file) + '</option>';
    });
    if (selected && !seen) opts += '<option value="' + esc(selected) + '" selected>' + esc(selected) + ' (missing in R2)</option>';
    return opts;
  }
  function renderPlaylist() {
    var ol = $("pl"); ol.innerHTML = "";
    cfg.tracks.forEach(function (t, i) {
      var li = document.createElement("li");
      li.className = "row";
      li.setAttribute("data-dur", t.dur || "");
      li.innerHTML =
        '<span class="num">' + (i + 1 < 10 ? "0" : "") + (i + 1) + '</span>' +
        '<input class="t-title" type="text" value="' + esc(t.title || "") + '">' +
        '<select class="t-file">' + fileOptions(t.file || "") + '</select>' +
        '<select class="t-fx"><option value="">no fx</option><option value="rain"' + (t.fx === "rain" ? " selected" : "") + '>rain</option></select>' +
        '<span class="acts"><button class="btn2 mini up">↑</button><button class="btn2 mini down">↓</button><button class="btn2 mini rm">✕</button></span>';
      ol.appendChild(li);
      li.querySelector(".up").onclick = function () { move(i, -1); };
      li.querySelector(".down").onclick = function () { move(i, 1); };
      li.querySelector(".rm").onclick = function () {
        collect();
        if (!confirm('Remove "' + (cfg.tracks[i] && cfg.tracks[i].title || "") + '" from the playlist?')) return;
        cfg.tracks.splice(i, 1);
        renderPlaylist();
      };
    });
    var used = {}; cfg.tracks.forEach(function (t) { used[t.file] = 1; });
    var html = '<option value="">— add a track from R2 —</option>';
    files.forEach(function (f) { if (!used[f.file]) html += '<option value="' + esc(f.file) + '">' + esc(f.file) + '</option>'; });
    $("addSel").innerHTML = html;
  }
  function move(i, dir) {
    collect();
    var j = i + dir; if (j < 0 || j >= cfg.tracks.length) return;
    var tmp = cfg.tracks[i]; cfg.tracks[i] = cfg.tracks[j]; cfg.tracks[j] = tmp;
    renderPlaylist();
  }
  function collect() {
    var arr = [];
    // keep empty-file rows too — move/remove are index-based, so the array must
    // stay aligned with the DOM; empties are dropped at save time instead.
    Array.prototype.forEach.call($("pl").querySelectorAll(".row"), function (r) {
      var file = r.querySelector(".t-file").value;
      var title = r.querySelector(".t-title").value.trim();
      var fx = r.querySelector(".t-fx").value;
      var dur = r.getAttribute("data-dur") || "";
      var o = { title: title || file, file: file };
      if (fx) o.fx = fx;
      if (dur) o.dur = dur;
      arr.push(o);
    });
    cfg.tracks = arr;
    cfg.radio = { streamUrl: $("r_stream").value.trim(), station: $("r_station").value.trim(), sub: $("r_sub").value.trim(), enabled: $("r_enabled").checked };
    cfg.content = { heroLead1: $("c_hero1").value, heroLead2: $("c_hero2").value, listenTitle: $("c_ltitle").value, listenIntro: $("c_lintro").value, soundcloudUrl: $("c_sc").value.trim() };
  }
  $("addBtn").onclick = function () {
    var f = $("addSel").value; if (!f) return;
    collect();
    cfg.tracks.push({ title: f.replace(/\.[^.]+$/, ""), file: f });
    renderPlaylist();
    probeDuration(f);
  };
  /* fill the track's duration from the audio metadata (async, non-blocking) */
  function probeDuration(file) {
    var a = new Audio();
    a.preload = "metadata";
    a.src = R2_BASE + file.split("/").map(encodeURIComponent).join("/");
    a.addEventListener("loadedmetadata", function () {
      if (!isFinite(a.duration) || a.duration <= 0) return;
      var m = Math.floor(a.duration / 60), s = Math.floor(a.duration % 60);
      var dur = m + ":" + (s < 10 ? "0" : "") + s;
      collect();
      cfg.tracks.forEach(function (t) { if (t.file === file && !t.dur) t.dur = dur; });
      renderPlaylist();
    });
  }
  $("refreshBtn").onclick = function () {
    status("refreshing files…");
    loadFiles().then(function () { collect(); renderPlaylist(); status("files refreshed", "ok"); }).catch(function () { status("failed", "err"); });
  };

  /* ---- radio / texts ---- */
  function renderRadio() {
    var r = cfg.radio || {};
    $("r_stream").value = r.streamUrl || ""; $("r_station").value = r.station || ""; $("r_sub").value = r.sub || "";
    $("r_enabled").checked = r.enabled !== false;
  }
  function renderTexts() {
    var c = cfg.content || {};
    $("c_hero1").value = c.heroLead1 || ""; $("c_hero2").value = c.heroLead2 || "";
    $("c_ltitle").value = c.listenTitle || ""; $("c_lintro").value = c.listenIntro || ""; $("c_sc").value = c.soundcloudUrl || "";
  }

  /* ---- stats: 30-day visits bar chart + per-track download table ---- */
  function fmtDay(d) {
    var dt = new Date(d + "T00:00:00Z");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  function renderVisits() {
    var el = $("vchart"), tip = $("vtip"); if (!el || !tip) return;
    el.innerHTML = "";
    var days = stats.days;
    var vals = days.map(function (d) { return stats.visits[d] || 0; });
    var max = Math.max(1, vals.reduce(function (a, b) { return Math.max(a, b); }, 0));
    var total = vals.reduce(function (a, b) { return a + b; }, 0);
    var todayIdx = days.length - 1;
    days.forEach(function (d, i) {
      var v = vals[i];
      var bar = document.createElement("div");
      bar.className = "bar" + (i === todayIdx ? " today" : "");
      bar.style.height = Math.max(3, Math.round((v / max) * 100)) + "%";
      bar.tabIndex = 0;
      var label = fmtDay(d) + (i === todayIdx ? " (today)" : "") + ": " + v + (v === 1 ? " visitor" : " visitors");
      bar.setAttribute("aria-label", label);
      function show() {
        tip.innerHTML = "";
        var strong = document.createElement("b"); strong.textContent = v + (v === 1 ? " visitor" : " visitors");
        tip.appendChild(strong);
        tip.appendChild(document.createTextNode(" · " + fmtDay(d) + (i === todayIdx ? " (today)" : "")));
        var r = bar.getBoundingClientRect(), pr = el.getBoundingClientRect();
        tip.style.left = (r.left - pr.left + r.width / 2) + "px";
        tip.style.top = "0px";
        tip.classList.add("show");
      }
      function hide() { tip.classList.remove("show"); }
      bar.addEventListener("pointerenter", show);
      bar.addEventListener("pointerleave", hide);
      bar.addEventListener("focus", show);
      bar.addEventListener("blur", hide);
      el.appendChild(bar);
    });
    var vs = $("visitsSummary");
    if (vs) vs.textContent = days.length ? (total + " unique " + (total === 1 ? "visitor" : "visitors") + " over the last " + days.length + " days") : "no data yet";
  }
  function renderDownloads() {
    var el = $("dlTable"); if (!el) return;
    el.innerHTML = "";
    var rows = cfg.tracks.map(function (t) { return { title: t.title || t.file, n: stats.downloads[t.file] || 0 }; });
    var ds = $("dlSummary");
    if (!rows.length) {
      el.innerHTML = '<div class="dl-empty">no tracks yet</div>';
      if (ds) ds.textContent = "no tracks yet";
      return;
    }
    rows.sort(function (a, b) { return b.n - a.n; });
    var max = Math.max(1, rows.reduce(function (m, r) { return Math.max(m, r.n); }, 0));
    rows.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "dl-row";
      var fill = document.createElement("span"); fill.className = "fill"; fill.style.width = Math.round((r.n / max) * 100) + "%";
      var ttl = document.createElement("span"); ttl.className = "ttl"; ttl.textContent = r.title;
      var cnt = document.createElement("span"); cnt.className = "cnt"; cnt.textContent = r.n;
      row.appendChild(fill); row.appendChild(ttl); row.appendChild(cnt);
      el.appendChild(row);
    });
    var total = rows.reduce(function (a, r) { return a + r.n; }, 0);
    if (ds) ds.textContent = total + " total download" + (total === 1 ? "" : "s") + " across " + rows.length + " track" + (rows.length === 1 ? "" : "s");
  }
  function renderStats() { renderVisits(); renderDownloads(); }
  var statsRefreshBtn = $("statsRefresh");
  if (statsRefreshBtn) statsRefreshBtn.onclick = function () {
    $("visitsSummary").textContent = "refreshing…"; $("dlSummary").textContent = "refreshing…";
    loadStats().then(renderStats).catch(function () {
      $("visitsSummary").textContent = "refresh failed"; $("dlSummary").textContent = "refresh failed";
    });
  };

  /* ---- save ---- */
  $("saveBtn").onclick = function () {
    collect();
    cfg.tracks = cfg.tracks.filter(function (t) { return t.file; });
    renderPlaylist();
    status("saving…");
    fetch(API + "/admin/save", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, auth()), body: JSON.stringify(cfg) })
      .then(function (r) { if (r.status === 401) { status("unauthorized — re-login", "err"); throw 1; } if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { if (j && j.ok) status("saved ✓ live", "ok"); })
      .catch(function (e) { if (e !== 1) status("save failed", "err"); });
  };

  /* ---- auto-enter if a valid password is already stored ---- */
  if (pw) doLogin(pw).then(function (ok) { if (ok) { showEditor(); loadAll(); } else { sessionStorage.removeItem("zalturiAdminPw"); pw = ""; } });
})();
