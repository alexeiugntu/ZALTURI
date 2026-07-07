/* =========================================================================
   ZALTURI — player.js · System 7 amber player (R2-hosted tracks)
   - playlist + transport + seek + volume
   - per-track download (blob when CORS allows, else opens the file)
   - feeds a real spectrum (Web Audio AnalyserNode) into "The block"
     equalizer via window.ZALTURI_EQ (falls back to procedural if no CORS)
   ========================================================================= */
(function () {
  "use strict";

  /* =======================================================================
     CONFIG  ·  fill these once R2 public access + CORS are set up.
     R2_BASE : PUBLIC base URL that serves the audio files, ending in "/".
               Must send CORS (Access-Control-Allow-Origin) for the real
               spectrum + one-click downloads to work.
     TRACKS  : order shown in the playlist. `file` must match the object key
               exactly (case-sensitive). `dur` is optional (auto-filled from
               metadata once a track loads).
     ===================================================================== */
  var R2_BASE = "https://audio.zalturi.com/Zalturi_tracks/";
  var TRACKS = [
    // ---- pinned order ----
    { title: "Milky — Just The Way You Are (Zalturi bootleg)", file: "Milky - Just the way you are(Zalturi bootleg).wav", dur: "" },
    { title: "Kino — Peremen (Zalturi remix)", file: "kino - peremen(Zalturi remix).mp3", dur: "" },
    { title: "Salavat Fathetdinov — Salkyn Chey (Zalturi bootleg)", file: "salavat fathetdinov - sylkyn cheĭ(Zalturi bootleg).wav", dur: "" },
    { title: "Tatyana Ovsienko — Dalnoboyschik (Zalturi remix)", file: "tatjyana ovsienko - daljnoboyschik(Zalturi remix).wav", dur: "", rain: true },
    { title: "Temnyy Princ, 9Mice — Jealous (Zalturi bootleg)", file: "temnyy princ, 9Mice - Jealous(Zalturi bootleg).wav", dur: "" },
    { title: "ZALTURI — Boginya", file: "Zalturi - BOGINYA.wav", dur: "" },
    { title: "ZALTURI — Bu Ispugalsya", file: "Zalturi - BU ISPUGALSYA.mp3", dur: "" },
    { title: "Hleb — Shashlyndos (Zalturi bootleg)", file: "hleb - shashlyndos(Zalturi bootleg).mp3", dur: "" },
    { title: "Mc Poh — Banjka Parilka (Zalturi bootleg)", file: "Mc poh - banjka parilka (Zalturi bootleg).wav", dur: "" },
    // ---- the rest ----
    { title: "Fiollo — Manty", file: "Fiollo - manty.mp3", dur: "" },
    { title: "Funky Town iz Shreka (Zalturi Edit)", file: "Funky town iz shreka(Zalturi Edit).mp3", dur: "" },
    { title: "HOFMANNITA — Lapki (Rawdy remix)", file: "HOFMANNITA - lapki(Rawdy remix.mp3", dur: "" },
    { title: "Ralfkon — Djyavol Nosit Prada (Zalturi bootleg)", file: "Ralfkon - djyavol nosit prada(Zalturi bootleg).mp3", dur: "" },
    { title: "ZALTURI — Echpech Mac M1 (tatar pizdecy)", file: "Zalturi - (tatar pizdecy) echpech mac m1.wav", dur: "" },
    { title: "ZALTURI — Vladimir Nuxuya", file: "Zalturi - Vladimir Nuxuya.mp3", dur: "" },
    { title: "ZALTURI — Acha Dacha", file: "Zalturi - acha dacha.mp3", dur: "" },
    { title: "ZALTURI — Bomji (kabaniy klyk)", file: "Zalturi - bomji(kabaniĭ klyk).mp3.wav", dur: "" },
    { title: "ZALTURI — Edalovo 2", file: "Zalturi - edalovo 2.mp3", dur: "" },
    { title: "ZALTURI — Intro Daljnoboy", file: "Zalturi - intro daljnoboy.wav", dur: "" },
    { title: "ZALTURI — Poslednii Den v Bazzare", file: "Zalturi - poslednii den v bazzare.mp3", dur: "" },
    { title: "ZALTURI — Rave of Tatar", file: "Zalturi - rave of tatar.wav", dur: "" },
    { title: "ZALTURI — Sosat Cock", file: "Zalturi - sosat cock.wav", dur: "" },
    { title: "Igorj Nikolaev — Deljfin i Rusalka (Zalturi bootleg)", file: "igorj nikolaev - deljfin i rusalka(Zalturi bootleg).wav", dur: "" },
    { title: "Shura — Ty Ne Verj Slezam (Fiollo mix)", file: "shura - ty ne verj slezam(Fiollo mix).mp3", dur: "" },
    { title: "Smeshariki Pizdec", file: "smeshariki pizdec.mp3", dur: "" },
    { title: "Sveta — Hvatit Dovoljno (Zalturi remix)", file: "sveta - hvatit dovoljno(Zalturi remix).wav", dur: "" },
    { title: "Tugan Yak (Zalturi house bootleg)", file: "tugan yak(Zalturi house bootleg).wav", dur: "" }
  ];
  /* ===================================================================== */

  var root = document.getElementById("mac-player");
  if (!root) return;
  var audio = document.getElementById("mp-audio");
  var listEl = root.querySelector(".mp-list");
  var nowEl = root.querySelector(".mp-nowplaying");
  var nowTextEl = root.querySelector(".mp-now-text");
  var curEl = root.querySelector(".mp-cur");
  var durEl = root.querySelector(".mp-dur");
  var seek = root.querySelector(".mp-seek");
  var seekFill = root.querySelector(".mp-seek-fill");
  var playBtn = root.querySelector(".mp-play");
  var prevBtn = root.querySelector(".mp-prev");
  var nextBtn = root.querySelector(".mp-next");
  var volEl = root.querySelector(".mp-vol input");

  var idx = -1;
  var rows = [];
  // Touch devices: play the <audio> natively (no Web Audio graph) so playback
  // survives screen lock / backgrounding on iOS. Desktop keeps the real-FFT graph.
  var mobileLike = !!(window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  var MS = ("mediaSession" in navigator) ? navigator.mediaSession : null;
  // shared audio bus so the player and the pirate radio never play at once
  var audioBus = ("BroadcastChannel" in window) ? new BroadcastChannel("zalturi-audio") : null;
  if (audioBus) audioBus.onmessage = function (e) { if (e.data && e.data.from === "radio" && !audio.paused) audio.pause(); };

  function fileURL(t) { return R2_BASE + t.file.split("/").map(encodeURIComponent).join("/"); }
  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return m + ":" + (ss < 10 ? "0" : "") + ss;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ------------------------------------------------------------- playlist */
  function buildList() {
  listEl.innerHTML = "";
  rows = [];
  var cnt = root.querySelector(".mp-count");
  if (cnt) cnt.textContent = TRACKS.length + " tracks";
  if (!TRACKS.length) {
    var empty = document.createElement("li");
    empty.className = "mp-empty";
    empty.textContent = "no tracks configured yet";
    listEl.appendChild(empty);
  }
  TRACKS.forEach(function (t, i) {
    var li = document.createElement("li");
    li.className = "mp-row";
    li.setAttribute("role", "button");
    li.setAttribute("tabindex", "0");
    li.setAttribute("aria-current", "false");

    var n = document.createElement("span"); n.className = "n"; n.textContent = pad(i + 1);
    var tt = document.createElement("span"); tt.className = "t"; tt.textContent = t.title;
    var d = document.createElement("span"); d.className = "d"; d.textContent = t.dur || "";
    var dl = document.createElement("a");
    dl.className = "dl";
    dl.href = fileURL(t);
    dl.setAttribute("download", t.file);
    dl.setAttribute("title", "Download " + t.title);
    dl.setAttribute("aria-label", "Download " + t.title);
    dl.innerHTML = '<svg viewBox="0 0 12 12" width="13" height="13" fill="currentColor" aria-hidden="true"><rect x="5" y="1" width="2" height="6"/><path d="M2 6h8l-4 5z"/></svg>';

    li.appendChild(n); li.appendChild(tt); li.appendChild(d); li.appendChild(dl);
    listEl.appendChild(li);
    rows.push({ li: li, d: d });

    li.addEventListener("click", function (e) {
      if (e.target.closest(".dl")) return;
      select(i, true);
    });
    li.addEventListener("keydown", function (e) {
      // Enter selects the row; Space is reserved for the global play/pause toggle
      if (e.key === "Enter") { e.preventDefault(); select(i, true); }
    });
    dl.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); download(i); });
  });
  }

  /* -------------------------------------------------------------- select */
  function select(i, autoplay) {
    if (i < 0 || i >= TRACKS.length) return;
    var t = TRACKS[i];
    if (i !== idx) {
      idx = i;
      audio.src = fileURL(t);
      if (nowTextEl) nowTextEl.textContent = t.title;
      scheduleMarquee();
      updateMetadata(t);
      curEl.textContent = "0:00";
      durEl.textContent = t.dur || "0:00";
      seekFill.style.width = "0%";
      for (var r = 0; r < rows.length; r++) {
        var on = r === idx;
        rows[r].li.setAttribute("aria-current", on ? "true" : "false");
      }
    }
    if (autoplay) play();
  }

  /* ------------------------------------------------------------- control */
  function play() {
    if (idx < 0) { select(0, false); }
    initGraph();
    if (actx && actx.state === "suspended") actx.resume();
    var p = audio.play();
    if (p && p.catch) p.catch(function () { /* gesture needed — user taps again */ });
  }
  function pause() { audio.pause(); }
  function toggle() { audio.paused ? play() : pause(); }
  function prev() { select(idx <= 0 ? TRACKS.length - 1 : idx - 1, true); }
  function next() { select(idx >= TRACKS.length - 1 ? 0 : idx + 1, true); }

  function updateMetadata(t) {
    if (!MS || !window.MediaMetadata) return;
    try {
      MS.metadata = new MediaMetadata({
        title: t.title, artist: "ZALTURI", album: "ZALTURI — free pack",
        artwork: [{ src: "https://zalturi.com/assets/img/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
      });
    } catch (e) {}
  }
  if (MS) {
    try {
      MS.setActionHandler("play", function () { play(); });
      MS.setActionHandler("pause", function () { pause(); });
      MS.setActionHandler("previoustrack", function () { prev(); });
      MS.setActionHandler("nexttrack", function () { next(); });
    } catch (e) {}
  }

  if (playBtn) playBtn.addEventListener("click", toggle);
  if (prevBtn) prevBtn.addEventListener("click", prev);
  if (nextBtn) nextBtn.addEventListener("click", next);

  // the house equalizer starts playback on tap ("...or tap the house")
  window.ZALTURI_PLAYER = {
    toggle: toggle,
    playIfPaused: function () { if (audio.paused) play(); }
  };

  // Spacebar toggles play/pause anywhere on the page (except while typing in a field)
  document.addEventListener("keydown", function (e) {
    if (e.repeat) return;
    if (e.code !== "Space" && e.key !== " " && e.keyCode !== 32) return;
    var el = document.activeElement, tag = el && el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el && el.isContentEditable)) return;
    e.preventDefault();
    // if a player button has focus, drop focus so its native Space-activation
    // can't fire a second toggle (which would cancel out the start)
    if (el && el.blur && (el === playBtn || el === prevBtn || el === nextBtn)) el.blur();
    toggle();
  });

  audio.addEventListener("play", function () {
    root.setAttribute("data-state", "playing");
    if (audioBus) try { audioBus.postMessage({ from: "player" }); } catch (e) {}
    if (MS) MS.playbackState = "playing";
    if (playBtn) { playBtn.textContent = "❙❙"; playBtn.setAttribute("aria-label", "Pause"); }
    if (window.ZALTURI_EQ) {
      window.ZALTURI_EQ.setPlaying(true);
      if (window.ZALTURI_EQ.setRain) window.ZALTURI_EQ.setRain(idx >= 0 && !!(TRACKS[idx].rain || TRACKS[idx].fx === "rain"));
    }
    startFFT();
  });
  audio.addEventListener("pause", function () {
    root.setAttribute("data-state", "paused");
    if (MS) MS.playbackState = "paused";
    if (playBtn) { playBtn.textContent = "▶"; playBtn.setAttribute("aria-label", "Play"); }
    if (window.ZALTURI_EQ) {
      window.ZALTURI_EQ.setPlaying(false);
      if (window.ZALTURI_EQ.setRain) window.ZALTURI_EQ.setRain(false);
    }
  });
  audio.addEventListener("ended", function () { next(); });
  audio.addEventListener("loadedmetadata", function () {
    durEl.textContent = fmt(audio.duration);
    if (idx >= 0 && rows[idx] && !TRACKS[idx].dur) rows[idx].d.textContent = fmt(audio.duration);
  });
  audio.addEventListener("timeupdate", function () {
    curEl.textContent = fmt(audio.currentTime);
    if (audio.duration) seekFill.style.width = (audio.currentTime / audio.duration * 100) + "%";
  });

  /* CORS/crossorigin fallback: if the annotated media fails to load (usually
     missing CORS on R2), retry once without crossorigin so playback still
     works — the equalizer then stays on its procedural fallback. */
  var triedNoCors = false;
  audio.addEventListener("error", function () {
    if (!triedNoCors && audio.getAttribute("crossorigin")) {
      triedNoCors = true;
      fftFailed = true;
      audio.removeAttribute("crossorigin");
      if (idx >= 0) {
        var was = !audio.paused;
        audio.src = fileURL(TRACKS[idx]);
        audio.load();
        if (was) play();
      }
    }
  });

  /* seek + volume */
  if (seek) seek.addEventListener("click", function (e) {
    if (!audio.duration) return;
    var r = seek.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
  });
  var curVol = 0.85;
  function applyVolume(v) {
    curVol = v;
    if (gainNode) { gainNode.gain.value = v; audio.volume = 1; }
    else { audio.volume = v; }
  }
  if (volEl) {
    volEl.value = "0.85";
    applyVolume(0.85);
    volEl.addEventListener("input", function () { applyVolume(parseFloat(volEl.value)); });
  }

  /* ------------------------------------------------------------ download */
  function download(i) {
    var t = TRACKS[i], u = fileURL(t);
    try {
      fetch("https://zalturi-admin.zalturi.workers.dev/hit-download", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: t.file }), keepalive: true
      }).catch(function () {});
    } catch (e) {}
    fetch(u, { mode: "cors" })
      .then(function (r) { if (!r.ok) throw 0; return r.blob(); })
      .then(function (b) {
        var o = URL.createObjectURL(b);
        var a = document.createElement("a");
        a.href = o; a.download = t.file;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(o); a.remove(); }, 4000);
      })
      .catch(function () { window.open(u, "_blank", "noopener"); });
  }

  /* --------------------------------------------------- real spectrum FFT */
  var actx = null, analyser = null, srcNode = null, gainNode = null, freq = null, raf = 0;
  var fftOn = false, fftFailed = false;
  var COLS = 16, bands = new Float32Array(COLS), edges = null;

  function initGraph() {
    if (fftOn || fftFailed) return;
    if (mobileLike) { fftFailed = true; return; }   // native playback on touch → survives screen lock
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { fftFailed = true; return; }
    try {
      actx = new AC();
      srcNode = actx.createMediaElementSource(audio);
      analyser = actx.createAnalyser();
      analyser.fftSize = 2048;                 // ~21 Hz/bin @44.1k — real bass resolution
      analyser.smoothingTimeConstant = 0.8;
      // source -> analyser (taps full signal) -> gain (volume) -> output.
      // GainNode drives volume so it works on iOS too (audio.volume is read-only there).
      gainNode = actx.createGain();
      gainNode.gain.value = curVol;
      srcNode.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(actx.destination);
      audio.volume = 1;
      freq = new Uint8Array(analyser.frequencyBinCount);
      // log-spaced band edges 40 Hz .. 16 kHz; start at bin>=1 so the DC bin
      // (never truly silent) can't light the leftmost column with no bass.
      var binHz = actx.sampleRate / analyser.fftSize;
      var fMin = 40, fMax = Math.min(16000, actx.sampleRate / 2);
      edges = new Array(COLS + 1);
      for (var e = 0; e <= COLS; e++) {
        var bin = Math.round(fMin * Math.pow(fMax / fMin, e / COLS) / binHz);
        edges[e] = bin < 1 ? 1 : bin;
      }
      for (e = 1; e <= COLS; e++) if (edges[e] <= edges[e - 1]) edges[e] = edges[e - 1] + 1;
      fftOn = true;
    } catch (e2) { fftFailed = true; }
  }
  function startFFT() { if (fftOn && !raf) tick(); }
  function tick() {
    raf = requestAnimationFrame(tick);
    if (!fftOn || audio.paused) { raf = 0; return; }
    analyser.getByteFrequencyData(freq);
    var n = freq.length;
    for (var c = 0; c < COLS; c++) {
      var lo = edges[c], hi = edges[c + 1];
      if (lo >= n) lo = n - 1;
      if (hi > n) hi = n;
      var sum = 0, cnt = 0;
      for (var k = lo; k < hi; k++) { sum += freq[k]; cnt++; }
      var v = cnt ? (sum / cnt) / 255 : 0;
      // honest level, mild high-frequency tilt (music highs roll off)
      bands[c] = Math.min(1, Math.pow(v, 0.9) * (1 + c * 0.025));
    }
    if (window.ZALTURI_EQ) window.ZALTURI_EQ.setBands(bands);
  }

  /* now-playing marquee — scroll the title only when it doesn't fit the field */
  var marqTimer = 0;
  function scheduleMarquee() {
    if (marqTimer) cancelAnimationFrame(marqTimer);
    marqTimer = requestAnimationFrame(refreshMarquee);
  }
  function refreshMarquee() {
    marqTimer = 0;
    if (!nowEl || !nowTextEl) return;
    nowEl.classList.remove("is-marquee");
    nowEl.style.removeProperty("--marquee-shift");
    nowEl.style.removeProperty("--marquee-duration");
    nowTextEl.style.removeProperty("animation-delay");
    var distance = nowTextEl.scrollWidth - nowEl.clientWidth;
    if (distance <= 2) return;                       // fits — stay static
    distance += 22;
    nowEl.style.setProperty("--marquee-shift", "-" + distance + "px");
    nowEl.style.setProperty("--marquee-duration", Math.max(9, Math.min(24, distance / 9)).toFixed(1) + "s");
    nowTextEl.style.animationDelay = "1.2s";
    void nowTextEl.offsetWidth;
    nowEl.classList.add("is-marquee");
  }
  window.addEventListener("resize", scheduleMarquee);
  window.addEventListener("orientationchange", scheduleMarquee);
  window.addEventListener("pageshow", scheduleMarquee);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleMarquee);
  // re-measure as the (iframe) layout + fonts settle, so overflow is caught reliably
  [150, 500, 1200, 2500].forEach(function (dl) { window.setTimeout(scheduleMarquee, dl); });

  /* load the live config from the control panel, then build the playlist.
     falls back to the baked-in TRACKS if the worker is slow/unreachable (3s cap). */
  function raceTimeout(p, ms) {
    return Promise.race([p, new Promise(function (r) { setTimeout(function () { r(null); }, ms); })]);
  }
  raceTimeout(
    fetch("https://zalturi-admin.zalturi.workers.dev/config", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; }),
    3000
  ).then(function (cfg) {
    // accept only well-formed tracks — one bad entry must not kill the playlist
    var list = (cfg && Array.isArray(cfg.tracks) ? cfg.tracks : []).filter(function (t) {
      return t && typeof t.file === "string" && t.file;
    });
    if (list.length) TRACKS = list;
    buildList();
    select(0, false);
    scheduleMarquee();
  });
})();
