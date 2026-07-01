/* =========================================================================
   ZALTURI pirate radio
   Keeps the station alive while internal pages navigate inside a same-origin
   iframe shell. The audio element stays in the parent document.
   ========================================================================= */
(function () {
  "use strict";

  var STREAM_URL = "https://stream-286.surfernetwork.com/1t7w7w8r7whvv";
  var CSS_URL = "/assets/css/base.css?v=20260701i";
  var STATION = "ZALTURI PIRATE STATION";
  var child = window.top !== window;

  if (child) {
    document.addEventListener("click", function (event) {
      var trigger = event.target.closest && event.target.closest("[data-radio-open]");
      if (!trigger) return;
      event.preventDefault();
      window.parent.postMessage({ type: "zalturi-radio-open" }, window.location.origin);
    });
    return;
  }

  if (window.__zalturiRadioBooted) return;
  window.__zalturiRadioBooted = true;

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  }

  ready(function () {
    ensureShellCss();
    var shell = buildShell();
    var radio = buildRadio();
    shell.mount();
    radio.mount();
    window.addEventListener("message", function (event) {
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === "zalturi-radio-open") radio.focus();
    });
  });

  function ensureShellCss() {
    if (document.querySelector('link[rel="stylesheet"][href="' + CSS_URL + '"], link[data-zalturi-shell-css][href="' + CSS_URL + '"]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS_URL;
    link.setAttribute("data-zalturi-shell-css", "true");
    document.head.appendChild(link);
  }

  function buildShell() {
    var startHref = window.location.href;
    var frame;
    var loading;
    var frameHeightTick = 0;
    var frameResizeObserver = null;
    var syncing = false;
    var lastFrameUrl = "";

    function mount() {
      document.body.className = "z-shell-host";
      document.body.innerHTML =
        '<div class="z-shell-scan" aria-hidden="true"></div>' +
        '<iframe class="z-site-frame" title="ZALTURI site" src="about:blank" scrolling="no" allow="microphone; camera; autoplay; encrypted-media; clipboard-write; fullscreen" allowfullscreen></iframe>' +
        '<div class="z-frame-loading" aria-hidden="true"><span></span><b>tuning</b></div>';

      frame = document.querySelector(".z-site-frame");
      loading = document.querySelector(".z-frame-loading");
      frame.addEventListener("load", onFrameLoad);
      frame.src = startHref;

      window.addEventListener("popstate", function () {
        if (!frame) return;
        syncing = true;
        loading.classList.add("is-on");
        frame.src = window.location.href;
      });
      window.addEventListener("resize", scheduleFrameHeight);
      window.addEventListener("orientationchange", scheduleFrameHeight);
    }

    function onFrameLoad() {
      loading.classList.remove("is-on");
      try {
        var doc = frame.contentDocument;
        var loc = frame.contentWindow.location;
        var next = loc.pathname + loc.search + loc.hash;
        if (doc && doc.title) document.title = doc.title;
        addFramePadding(doc);
        wireFrameSizing(doc);
        if (lastFrameUrl && next !== lastFrameUrl && !loc.hash) window.scrollTo(0, 0);
        lastFrameUrl = next;
        if (!syncing && next !== window.location.pathname + window.location.search + window.location.hash) {
          history.pushState({ zalturiFrame: true }, doc && doc.title ? doc.title : "", next);
        }
      } catch (e) {
        return;
      } finally {
        syncing = false;
      }
    }

    function addFramePadding(doc) {
      if (!doc || !doc.head || doc.getElementById("zalturi-radio-frame-pad")) return;
      var style = doc.createElement("style");
      style.id = "zalturi-radio-frame-pad";
      style.textContent = "html,body{overflow:hidden!important;min-height:0!important}body{padding-bottom:128px!important}@media(max-width:720px){body{padding-bottom:96px!important}}";
      doc.head.appendChild(style);
    }

    function wireFrameSizing(doc) {
      if (frameResizeObserver) frameResizeObserver.disconnect();
      if (window.ResizeObserver && doc.body) {
        try {
          frameResizeObserver = new ResizeObserver(scheduleFrameHeight);
          frameResizeObserver.observe(doc.documentElement);
          frameResizeObserver.observe(doc.body);
        } catch (e) {
          frameResizeObserver = null;
        }
      }
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(scheduleFrameHeight);
      Array.prototype.forEach.call(doc.querySelectorAll("img, iframe, video"), function (node) {
        node.addEventListener("load", scheduleFrameHeight, { once: true });
        node.addEventListener("loadedmetadata", scheduleFrameHeight, { once: true });
      });
      [40, 140, 360, 900, 1800].forEach(function (delay) {
        window.setTimeout(scheduleFrameHeight, delay);
      });
      scheduleFrameHeight();
    }

    function scheduleFrameHeight() {
      if (frameHeightTick) window.cancelAnimationFrame(frameHeightTick);
      frameHeightTick = window.requestAnimationFrame(syncFrameHeight);
    }

    function syncFrameHeight() {
      frameHeightTick = 0;
      if (!frame) return;
      try {
        var doc = frame.contentDocument;
        if (!doc || !doc.documentElement || !doc.body) return;
        var html = doc.documentElement;
        var body = doc.body;
        var height = Math.max(
          html.scrollHeight,
          body.scrollHeight,
          html.offsetHeight,
          body.offsetHeight,
          html.clientHeight
        );
        frame.style.height = Math.ceil(height) + "px";
        document.documentElement.style.setProperty("--z-frame-height", Math.ceil(height) + "px");
      } catch (e) {}
    }

    return { mount: mount };
  }

  function buildRadio() {
    var root = document.createElement("section");
    var audio = document.createElement("audio");
    var playButton, volume, status, liveDot, bars;
    var marqueeItems = [];
    var marqueeTimer = 0;
    var userStarted = false;
    var tuneTimer = 0;

    audio.id = "zalturi-radio-audio";
    audio.preload = "none";
    audio.volume = readVolume();

    root.id = "zalturi-radio";
    root.className = "pirate-radio";
    root.setAttribute("aria-label", STATION);
    root.innerHTML =
      '<div class="pr-body">' +
        '<div class="pr-handle">' +
          '<button class="pr-play" type="button" aria-label="Play ZALTURI pirate station"><span>PLAY</span></button>' +
          '<button class="pr-toggle" type="button" aria-label="Expand radio" aria-expanded="false"><span class="pr-tg" aria-hidden="true">&lt;</span></button>' +
        '</div>' +
        '<div class="pr-panel">' +
          '<div class="pr-main">' +
            '<span class="pr-kicker"><i></i> live radio</span>' +
            '<strong class="pr-marquee" data-marquee><span class="pr-marquee-text">' + STATION + '</span></strong>' +
            '<span class="pr-sub pr-marquee" data-marquee><span class="pr-marquee-text">bootleg signal / browser broadcast</span></span>' +
          '</div>' +
          '<div class="pr-bars" aria-hidden="true">' +
            '<span></span><span></span><span></span><span></span><span></span><span></span>' +
          '</div>' +
          '<div class="pr-controls">' +
            '<p class="pr-copy pr-marquee" data-marquee><span class="pr-marquee-text">A dirty little receiver bolted to the page. It keeps running while you flip the site.</span></p>' +
            '<label class="pr-volume"><span>VOL</span><input type="range" min="0" max="100" value="' + Math.round(audio.volume * 100) + '"></label>' +
            '<span class="pr-status"><i></i><b>off air</b></span>' +
          '</div>' +
        '</div>' +
      '</div>';

    function mount() {
      document.body.appendChild(root);
      root.appendChild(audio);
      playButton = root.querySelector(".pr-play");
      volume = root.querySelector(".pr-volume input");
      status = root.querySelector(".pr-status b");
      liveDot = root.querySelector(".pr-status i");
      bars = root.querySelector(".pr-bars");
      marqueeItems = Array.prototype.slice.call(root.querySelectorAll("[data-marquee]"));

      playButton.addEventListener("click", toggle);
      var toggleBtn = root.querySelector(".pr-toggle");
      if (toggleBtn) toggleBtn.addEventListener("click", function () {
        var expanded = root.classList.toggle("is-expanded");
        toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
        toggleBtn.setAttribute("aria-label", expanded ? "Collapse radio" : "Expand radio");
        var tg = toggleBtn.querySelector(".pr-tg");
        if (tg) tg.textContent = expanded ? ">" : "<";
        if (expanded) scheduleMarquees();
      });
      volume.addEventListener("input", function () {
        audio.volume = Math.max(0, Math.min(1, Number(volume.value) / 100));
        syncVolumeUi();
        try { localStorage.setItem("zalturiRadioVolume", String(audio.volume)); } catch (e) {}
      });
      window.addEventListener("resize", scheduleMarquees);
      window.addEventListener("orientationchange", scheduleMarquees);
      window.addEventListener("pageshow", scheduleMarquees);
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) scheduleMarquees();
      });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleMarquees);

      audio.addEventListener("loadstart", function () {
        if (!userStarted) return;
        setState("tuning", "tuning");
        armTuneTimer();
      });
      audio.addEventListener("waiting", function () {
        if (!userStarted) return;
        setState("tuning", "buffering");
        armTuneTimer();
      });
      audio.addEventListener("playing", function () { clearTuneTimer(); setState("live", "live"); });
      audio.addEventListener("pause", function () {
        if (root.dataset.state === "tuning") return;
        clearTuneTimer();
        setState("off", "off air");
      });
      audio.addEventListener("error", function () { clearTuneTimer(); setState("error", "signal lost"); });

      setState("off", "off air");
      syncVolumeUi();
      scheduleMarquees();
      [120, 420, 900, 1600].forEach(function (delay) {
        window.setTimeout(scheduleMarquees, delay);
      });
    }

    function toggle() {
      if (audio.paused) play();
      else {
        audio.pause();
        setState("off", "off air");
      }
    }

    function play() {
      userStarted = true;
      setState("tuning", "tuning");
      audio.src = STREAM_URL;
      audio.load();
      armTuneTimer();
      audio.play().then(function () {
        clearTuneTimer();
        setState("live", "live");
      }).catch(function (error) {
        clearTuneTimer();
        window.__zalturiRadioLastError = error ? (error.name + ": " + error.message) : "unknown";
        setState("error", error && error.name === "NotAllowedError" ? "tap play" : "signal lost");
      });
    }

    function focusWidget() {
      root.classList.add("is-expanded");
      var tg = root.querySelector(".pr-toggle");
      if (tg) {
        tg.setAttribute("aria-expanded", "true");
        tg.setAttribute("aria-label", "Collapse radio");
        var s = tg.querySelector(".pr-tg");
        if (s) s.textContent = ">";
      }
      scheduleMarquees();
      root.classList.remove("is-ping");
      void root.offsetWidth;
      root.classList.add("is-ping");
    }

    function setState(kind, text) {
      root.dataset.state = kind;
      playButton.querySelector("span").textContent = audio.paused ? "PLAY" : "STOP";
      playButton.setAttribute("aria-label", audio.paused ? "Play ZALTURI pirate station" : "Stop ZALTURI pirate station");
      status.textContent = text;
      liveDot.className = "";
      bars.classList.toggle("is-live", kind === "live");
    }

    function syncVolumeUi() {
      var value = Math.round(audio.volume * 100);
      volume.value = String(value);
      volume.parentNode.style.setProperty("--volume-pct", value + "%");
    }

    function scheduleMarquees() {
      if (marqueeTimer) window.cancelAnimationFrame(marqueeTimer);
      marqueeTimer = window.requestAnimationFrame(refreshMarquees);
    }

    function refreshMarquees() {
      marqueeTimer = 0;
      marqueeItems.forEach(function (item) {
        var text = item.querySelector(".pr-marquee-text");
        if (!text) return;
        item.classList.remove("is-marquee");
        item.style.removeProperty("--marquee-distance");
        item.style.removeProperty("--marquee-shift");
        item.style.removeProperty("--marquee-duration");
        text.style.removeProperty("animation-delay");

        var distance = text.scrollWidth - item.clientWidth;
        if (distance <= 2) return;

        distance += 22;
        item.style.setProperty("--marquee-distance", distance + "px");
        item.style.setProperty("--marquee-shift", "-" + distance + "px");
        item.style.setProperty("--marquee-duration", Math.max(13, Math.min(26, distance / 10)).toFixed(1) + "s");
        text.style.animationDelay = "1.2s";
        void text.offsetWidth;
        item.classList.add("is-marquee");
      });
    }

    function clearTuneTimer() {
      if (!tuneTimer) return;
      window.clearTimeout(tuneTimer);
      tuneTimer = 0;
    }

    function armTuneTimer() {
      clearTuneTimer();
      tuneTimer = window.setTimeout(function () {
        if (root.dataset.state === "tuning") {
          userStarted = false;
          setState("error", "tap again");
        }
      }, 8000);
    }

    function readVolume() {
      try {
        var stored = localStorage.getItem("zalturiRadioVolume");
        if (stored != null && stored !== "") return Math.max(0, Math.min(1, Number(stored)));
      } catch (e) {}
      return 0.8;
    }

    return { mount: mount, focus: focusWidget };
  }
})();
