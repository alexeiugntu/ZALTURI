/* =========================================================================
   ZALTURI pirate radio
   Keeps the station alive while internal pages navigate inside a same-origin
   iframe shell. The audio element stays in the parent document.
   ========================================================================= */
(function () {
  "use strict";

  var STREAM_URL = "https://stream-286.surfernetwork.com/1t7w7w8r7whvv";
  var CSS_URL = "/assets/css/base.css?v=20260628d";
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
    var syncing = false;

    function mount() {
      document.body.className = "z-shell-host";
      document.body.innerHTML =
        '<div class="z-shell-scan" aria-hidden="true"></div>' +
        '<iframe class="z-site-frame" title="ZALTURI site" src="about:blank"></iframe>' +
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
    }

    function onFrameLoad() {
      loading.classList.remove("is-on");
      try {
        var doc = frame.contentDocument;
        var loc = frame.contentWindow.location;
        var next = loc.pathname + loc.search + loc.hash;
        if (doc && doc.title) document.title = doc.title;
        addFramePadding(doc);
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
      style.textContent = "body{padding-bottom:140px!important}@media(max-width:720px){body{padding-bottom:176px!important}}";
      doc.head.appendChild(style);
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
        '<button class="pr-play" type="button" aria-label="Play ZALTURI pirate station"><span>PLAY</span></button>' +
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
      volume.addEventListener("input", function () {
        audio.volume = Math.max(0, Math.min(1, Number(volume.value) / 100));
        syncVolumeUi();
        try { localStorage.setItem("zalturiRadioVolume", String(audio.volume)); } catch (e) {}
      });
      window.addEventListener("resize", scheduleMarquees);
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
        item.style.removeProperty("--marquee-duration");
        text.style.removeProperty("animationDelay");

        var distance = text.scrollWidth - item.clientWidth;
        if (distance <= 2) return;

        distance += 22;
        item.style.setProperty("--marquee-distance", distance + "px");
        item.style.setProperty("--marquee-duration", Math.max(13, Math.min(26, distance / 10)).toFixed(1) + "s");
        text.style.animationDelay = "1.2s";
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
