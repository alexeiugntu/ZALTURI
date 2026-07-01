/* ZALTURI control panel — talks to the Cloudflare worker (config + R2 list + save) */
(function () {
  "use strict";
  var API = "https://zalturi-admin.zalturi.workers.dev";
  var pw = sessionStorage.getItem("zalturiAdminPw") || "";
  var files = [];
  var cfg = { tracks: [], radio: {}, content: {} };

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
  function loadAll() {
    status("loading…");
    Promise.all([loadConfig(), loadFiles()]).then(function () {
      renderPlaylist(); renderRadio(); renderTexts(); status("loaded", "ok");
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
      li.innerHTML =
        '<span class="num">' + (i + 1 < 10 ? "0" : "") + (i + 1) + '</span>' +
        '<input class="t-title" type="text" value="' + esc(t.title || "") + '">' +
        '<select class="t-file">' + fileOptions(t.file || "") + '</select>' +
        '<select class="t-fx"><option value="">no fx</option><option value="rain"' + (t.fx === "rain" ? " selected" : "") + '>rain</option></select>' +
        '<span class="acts"><button class="btn2 mini up">↑</button><button class="btn2 mini down">↓</button><button class="btn2 mini rm">✕</button></span>';
      ol.appendChild(li);
      li.querySelector(".up").onclick = function () { move(i, -1); };
      li.querySelector(".down").onclick = function () { move(i, 1); };
      li.querySelector(".rm").onclick = function () { collect(); cfg.tracks.splice(i, 1); renderPlaylist(); };
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
    Array.prototype.forEach.call($("pl").querySelectorAll(".row"), function (r) {
      var file = r.querySelector(".t-file").value; if (!file) return;
      var title = r.querySelector(".t-title").value.trim();
      var fx = r.querySelector(".t-fx").value;
      var o = { title: title || file, file: file };
      if (fx) o.fx = fx;
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
  };
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

  /* ---- save ---- */
  $("saveBtn").onclick = function () {
    collect(); status("saving…");
    fetch(API + "/admin/save", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, auth()), body: JSON.stringify(cfg) })
      .then(function (r) { if (r.status === 401) { status("unauthorized — re-login", "err"); throw 1; } if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { if (j && j.ok) status("saved ✓ live", "ok"); })
      .catch(function (e) { if (e !== 1) status("save failed", "err"); });
  };

  /* ---- auto-enter if a valid password is already stored ---- */
  if (pw) doLogin(pw).then(function (ok) { if (ok) { showEditor(); loadAll(); } else { sessionStorage.removeItem("zalturiAdminPw"); pw = ""; } });
})();
