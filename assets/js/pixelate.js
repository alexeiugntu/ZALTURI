/* =========================================================================
   ZALTURI — pixelate.js
   Turns the cut-out character photo into living pixel-art on a <canvas>:
   - "assemble from pixels" reveal when it scrolls into view
   - subtle idle shimmer / glitch
   - pixels scatter away from the pointer, then settle
   Progressive enhancement: the original <img alt> stays in the DOM for SEO
   and is the no-JS / reduced-motion fallback.
   ========================================================================= */
(function () {
  "use strict";

  var img = document.querySelector("img[data-pixelate]");
  if (!img) return;

  var CELL = parseInt(img.getAttribute("data-cell") || "6", 10);
  var COLS = parseInt(img.getAttribute("data-cols") || "52", 10);
  // ZALTURI: force the hero to animate even under prefers-reduced-motion
  // (brand choice; restore matchMedia to respect the OS setting).
  var reduce = false;

  function start() {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return;

    var cols = COLS;
    var rows = Math.max(1, Math.round(cols * (ih / iw)));
    var W = cols * CELL, H = rows * CELL;

    // --- sample the image down to one colour per cell ---
    var s = document.createElement("canvas");
    s.width = cols; s.height = rows;
    var sx = s.getContext("2d");
    sx.imageSmoothingEnabled = false;
    var data;
    try {
      sx.drawImage(img, 0, 0, cols, rows);
      data = sx.getImageData(0, 0, cols, rows).data;
    } catch (e) {
      return; // tainted canvas (e.g. file://) — keep the <img> fallback
    }

    var n = cols * rows;
    var css = new Array(n);     // base colour string per cell
    var live = new Uint8Array(n); // 1 = opaque cell we draw
    var br = new Float32Array(n); // brightness boost
    var ox = new Float32Array(n); // x offset (px)
    var oy = new Float32Array(n); // y offset (px)
    var seen = new Uint8Array(n); // revealed yet
    var thr = new Float32Array(n); // reveal threshold 0..1
    var i, r, g, b, a;
    for (i = 0; i < n; i++) {
      a = data[i * 4 + 3];
      if (a < 28) { live[i] = 0; css[i] = null; }
      else {
        live[i] = 1;
        r = data[i * 4]; g = data[i * 4 + 1]; b = data[i * 4 + 2];
        css[i] = "rgb(" + r + "," + g + "," + b + ")";
      }
      thr[i] = Math.random();
    }

    // --- build the visible canvas, swap it in for the <img> ---
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    c.className = "art-canvas";
    c.setAttribute("role", "img");
    c.setAttribute("aria-label", img.alt || "ZALTURI");
    var ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    img.style.display = "none";
    img.parentNode.insertBefore(c, img);

    function drawCellColour(idx, boost) {
      var v = br[idx] * boost;
      if (v < 4) return css[idx];
      var p = idx * 4;
      var rr = Math.min(255, data[p] + v) | 0;
      var gg = Math.min(255, data[p + 1] + v) | 0;
      var bb = Math.min(255, data[p + 2] + v) | 0;
      return "rgb(" + rr + "," + gg + "," + bb + ")";
    }

    // static render (reduced motion / one-shot)
    function renderStatic() {
      ctx.clearRect(0, 0, W, H);
      for (var k = 0; k < n; k++) {
        if (!live[k]) continue;
        ctx.fillStyle = css[k];
        ctx.fillRect((k % cols) * CELL, ((k / cols) | 0) * CELL, CELL, CELL);
      }
    }

    if (reduce) { renderStatic(); return; }

    // --- animated path ---
    var revealT = 0, revealing = false, revealDur = 1100;
    var glitchUntil = 0, glitchRow = -1, glitchDx = 0;
    var raf = 0, running = false;

    function frame(now) {
      if (!running) return;
      raf = requestAnimationFrame(frame);

      // reveal progress
      var p = 1;
      if (revealing) {
        p = (now - revealT) / revealDur;
        if (p >= 1) { p = 1; revealing = false; }
      }

      // idle shimmer: nudge a few random cells
      for (var q = 0; q < 5; q++) {
        var ri = (Math.random() * n) | 0;
        if (live[ri]) br[ri] = Math.min(70, br[ri] + 30);
      }
      // rare glitch band
      if (!revealing && now > glitchUntil && Math.random() < 0.006) {
        glitchRow = (Math.random() * rows) | 0;
        glitchDx = (Math.random() < 0.5 ? -1 : 1) * (CELL * (1 + (Math.random() * 2 | 0)));
        glitchUntil = now + 90;
      }
      var glitchOn = now < glitchUntil;

      ctx.clearRect(0, 0, W, H);
      for (var k = 0; k < n; k++) {
        if (!live[k]) continue;
        var col = k % cols, row = (k / cols) | 0;

        // reveal gate
        if (!seen[k]) {
          if (p >= thr[k]) {
            seen[k] = 1;
            // pop in from a small random scatter
            ox[k] = (Math.random() - 0.5) * CELL * 4;
            oy[k] = (Math.random() - 0.5) * CELL * 4 - CELL * 2;
            br[k] = 80;
          } else {
            continue; // not revealed yet
          }
        }

        var x = col * CELL + ox[k];
        var y = row * CELL + oy[k];
        if (glitchOn && row === glitchRow) x += glitchDx;

        ctx.fillStyle = drawCellColour(k, 1);
        ctx.fillRect(x, y, CELL, CELL);

        // settle offsets & decay brightness
        ox[k] *= 0.82; oy[k] *= 0.82;
        if (Math.abs(ox[k]) < 0.2) ox[k] = 0;
        if (Math.abs(oy[k]) < 0.2) oy[k] = 0;
        br[k] *= 0.86;
        if (br[k] < 1) br[k] = 0;
      }
    }

    function play() {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }
    function stop() { running = false; cancelAnimationFrame(raf); }

    function beginReveal() {
      revealing = true;
      revealT = performance.now();
      play();
    }

    // pointer scatter
    function scatterAt(clientX, clientY, force) {
      var rect = c.getBoundingClientRect();
      var cx = (clientX - rect.left) / rect.width * W;
      var cy = (clientY - rect.top) / rect.height * H;
      var ccol = cx / CELL, crow = cy / CELL;
      var R = 5;
      for (var dr = -R; dr <= R; dr++) {
        for (var dc = -R; dc <= R; dc++) {
          var col = (ccol + dc) | 0, row = (crow + dr) | 0;
          if (col < 0 || col >= cols || row < 0 || row >= rows) continue;
          var idx = row * cols + col;
          if (!live[idx] || !seen[idx]) continue;
          var dist = Math.sqrt(dc * dc + dr * dr);
          if (dist > R) continue;
          var k = (1 - dist / R) * force;
          ox[idx] += dc / (dist + 0.5) * k * CELL;
          oy[idx] += dr / (dist + 0.5) * k * CELL;
          br[idx] = Math.min(90, br[idx] + k * 20);
        }
      }
    }

    c.addEventListener("pointermove", function (e) { scatterAt(e.clientX, e.clientY, 2.2); });
    c.addEventListener("pointerdown", function (e) { scatterAt(e.clientX, e.clientY, 6); });

    // start the reveal when it enters the viewport
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { beginReveal(); io.disconnect(); }
        });
      }, { threshold: 0.25 });
      io.observe(c);
    } else {
      beginReveal();
    }

    // pause off-tab to save battery
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else if (seen.indexOf(0) !== -1 || true) play();
    });
  }

  if (img.complete && img.naturalWidth) start();
  else img.addEventListener("load", start);
})();
