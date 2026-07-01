/* =========================================================================
   ZALTURI — equalizer.js · "The block"
   A 9-storey pixel-art Soviet panel house that doubles as an equalizer:
   each window column is a frequency band; windows light bottom-up, slow and
   warm, while the SoundCloud track plays.

   It's alive: residents, cats that hop onto the sill, silhouettes walking
   past windows, swaying curtains, flickering lamps & TVs, balconies stuffed
   with skis, bikes and laundry.

   Interactive (does NOT touch the player):
     • move the mouse  → a warm "torch" lights windows around the cursor
     • click the house → the more you click, the more windows switch on
   When a real track plays (SoundCloud Widget API), the equalizer takes over;
   interaction just layers extra light on top.
   ========================================================================= */
(function () {
  "use strict";

  var canvas = document.getElementById("eq-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  // ZALTURI: motion is core to the brand — the house animates even under
  // prefers-reduced-motion (intentional; toggle back to matchMedia to respect it).
  var reduce = false;

  /* ---- palette ---- */
  var SKY = "#1a1209", FAC = "#5b4a2c", FAC_LO = "#3a2c16",
      SEAM = "#2a2010", SEAM_HI = "rgba(126,106,62,0.22)",
      GROUND = "#241a0c", DOOR = "#0c0804";
  var OFF = [21, 17, 10], AMB = [232, 197, 106], HOT = [255, 243, 207];
  var FLOWERS = [[192,68,10],[232,197,106],[213,43,30],[198,104,127],[224,82,13]];
  var ACCENTS = { 4:[104,86,46], 5:[104,86,46], 11:[92,62,34], 12:[92,62,34] };

  /* ---- geometry (keep in sync with .eq-screen canvas aspect-ratio) ---- */
  var COLS = 16, FLOORS = 9;
  var WW = 14, WH = 11, FR = 2, GX = 8, GY = 7;
  var SIDE = 18, SKYH = 20, ROOF = 12, BASE = 18;
  var cellW = WW + 2 * FR, cellH = WH + 2 * FR;
  var bw = COLS * cellW + (COLS + 1) * GX;
  var bh = FLOORS * cellH + (FLOORS + 1) * GY;
  var CW = bw + 2 * SIDE, CH = SKYH + ROOF + bh + BASE;
  canvas.width = CW; canvas.height = CH;
  var bx = SIDE, by = SKYH + ROOF;
  function winX(c) { return bx + GX + c * (cellW + GX); }
  function winY(f) { return by + GY + f * (cellH + GY); }

  /* ---- deterministic RNG so the house is stable across frames ---- */
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var R = mulberry(20260627);
  function pick(pairs) { var tot = 0, i; for (i = 0; i < pairs.length; i++) tot += pairs[i][1]; var r = R() * tot; for (i = 0; i < pairs.length; i++) { r -= pairs[i][1]; if (r <= 0) return pairs[i][0]; } return pairs[0][0]; }

  // lots of plain/empty windows so the facade breathes (not overloaded)
  var WIN_TYPES = [["empty",34],["curtains",14],["blinds",8],["flower",9],["plant",6],
    ["stand",6],["sit",5],["cat",5],["dog",3],["lamp",6],["tv",5],["clutter",5],["grate",2],["boarded",2]];
  var BAL_CLUTTER = [["skis",5],["bike",5],["laundry",6],["boxes",5],["plant",4],["empty",2]];

  /* ---- build the scene ---- */
  var N = COLS * FLOORS;
  var cell = new Array(N);
  function balconyCol(c) { return c % 3 === 1; }   // denser balcony stacks
  for (var f = 0; f < FLOORS; f++) for (var c = 0; c < COLS; c++) {
    var idx = f * COLS + c;
    var s = { frame: R() < 0.35 ? "#b3a884" : "#33240f", animPhase: R() * 12000, animPer: 8000 + R() * 8000 };
    if (balconyCol(c) && f < FLOORS - 1 && R() < 0.9) { s.bal = true; s.clutter = pick(BAL_CLUTTER); }
    else {
      s.bal = false; s.type = pick(WIN_TYPES); s.side = R() < 0.5;
      s.flower = FLOWERS[(R() * FLOWERS.length) | 0]; s.flower2 = FLOWERS[(R() * FLOWERS.length) | 0];
      s.ac = (f < FLOORS - 1 && R() < 0.06);
    }
    cell[idx] = s;
  }
  // a few windows where someone walks past
  var walkers = [], cand = [];
  for (var i0 = 0; i0 < N; i0++) { var ss = cell[i0]; if (!ss.bal && ss.type !== "boarded") cand.push(i0); }
  for (var w0 = 0; w0 < 7 && cand.length; w0++) { var pi = (R() * cand.length) | 0, id = cand.splice(pi, 1)[0]; walkers.push({ c: id % COLS, f: (id / COLS) | 0, phase: R() * 12000, per: 7000 + R() * 8000 }); }
  var PIPE_X = Math.round(winX(9) - GX / 2 - 1);
  var DISH = { x: winX(14) - 4, y: winY(2) - 3 };

  /* ---- light state ---- */
  var band = new Float32Array(COLS), bandT = new Float32Array(COLS);
  var wb = new Float32Array(N), home = new Uint8Array(N), streak = new Uint8Array(COLS);
  var hov = new Float32Array(N), clk = new Float32Array(N), clkTh = new Float32Array(N), effB = new Float32Array(N);
  var i;
  for (i = 0; i < N; i++) { home[i] = R() < 0.13 ? 1 : 0; clkTh[i] = R(); }
  for (i = 0; i < COLS; i++) streak[i] = R() < 0.3 ? 1 : 0;

  var energy = 0.10, playing = false, clickCharge = 0, T = 0;
  var lastRetarget = 0, lastBeat = 0, lastLive = null;
  var realBands = null, realAt = 0;   // fed by player.js (real FFT); else procedural
  var rainOn = false, drops = null, puddles = null;   // pixel rain overlay (toggled per-track by player.js)
  var liveEl = document.querySelector(".eq-live"), liveTxt = liveEl ? liveEl.querySelector(".txt") : null;

  function shape(c) { var x = c / (COLS - 1); return 0.55 + 0.45 * Math.pow(1 - x, 1.4); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function glass(b) {
    var r, g, bl, t;
    if (b <= 0.6) { t = b / 0.6; r = lerp(OFF[0], AMB[0], t); g = lerp(OFF[1], AMB[1], t); bl = lerp(OFF[2], AMB[2], t); }
    else { t = (b - 0.6) / 0.4; r = lerp(AMB[0], HOT[0], t); g = lerp(AMB[1], HOT[1], t); bl = lerp(AMB[2], HOT[2], t); }
    return "rgb(" + (r | 0) + "," + (g | 0) + "," + (bl | 0) + ")";
  }
  function rgba(a, al) { return "rgba(" + a[0] + "," + a[1] + "," + a[2] + "," + al + ")"; }
  function setLive(on) { if (on === lastLive) return; lastLive = on; if (liveEl) liveEl.classList.toggle("on", on); if (liveTxt) liveTxt.textContent = on ? "live" : "idle"; }

  function step(now) {
    setLive(playing);
    var eT = playing ? (0.74 + 0.16 * Math.sin(now / 2300)) : 0.10;
    energy += (eT - energy) * 0.02;
    var useReal = realBands && (now - realAt < 300);
    if (useReal) {
      for (var c = 0; c < COLS; c++) bandT[c] = realBands[c];
    } else if (now - lastRetarget > 200) {
      for (var c1 = 0; c1 < COLS; c1++) bandT[c1] = energy * shape(c1) * (0.45 + Math.random() * 0.6);
      lastRetarget = now;
    }
    if (!useReal && playing && now - lastBeat > 620) { for (var k = 0; k < 3; k++) bandT[k] = Math.min(1, bandT[k] + 0.4); lastBeat = now; }
    for (var c2 = 0; c2 < COLS; c2++) band[c2] += (bandT[c2] - band[c2]) * (useReal ? 0.12 : 0.05);
    for (var col = 0; col < COLS; col++) {
      var level = band[col] * FLOORS;
      for (var fl = 0; fl < FLOORS; fl++) {
        var fromBottom = FLOORS - 1 - fl, idx = fl * COLS + col;
        var lit = Math.max(0, Math.min(1, level - fromBottom));
        var baseB = home[idx] ? (playing ? 0.22 : 0.17) : 0;
        wb[idx] += (Math.max(baseB, lit) - wb[idx]) * 0.08;
      }
    }
    // interaction channels
    clickCharge *= 0.985;
    for (var n = 0; n < N; n++) {
      hov[n] *= 0.92; if (hov[n] < 0.004) hov[n] = 0;
      var ct = Math.max(0, Math.min(1, (clickCharge - clkTh[n]) * 4));
      clk[n] += (ct - clk[n]) * 0.12;
    }
  }

  /* ============================ window contents ===================== */
  function curtains(gx, gy, b, s) { var a = (0.42 + 0.5 * b).toFixed(2);
    var sway = Math.round(Math.sin(T * 0.0016 + s.animPhase) * 1.3), lw = 3 + sway, rw = 3 - sway;
    if (lw < 2) lw = 2; if (rw < 2) rw = 2;
    ctx.fillStyle = "rgba(238,212,150," + a + ")"; ctx.fillRect(gx, gy, lw, WH); ctx.fillRect(gx + WW - rw, gy, rw, WH);
    ctx.fillStyle = "rgba(214,184,120," + a + ")"; ctx.fillRect(gx, gy, WW, 2); }
  function blinds(gx, gy, b) { var a = (0.5 + 0.4 * b).toFixed(2); ctx.fillStyle = "rgba(228,208,150," + a + ")"; for (var y = gy + 1; y < gy + WH - 1; y += 2) ctx.fillRect(gx, y, WW, 1); }
  function grate(gx, gy, b) { ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, WW, WH); ctx.clip();
    ctx.strokeStyle = "rgba(20,14,6," + (0.45 + 0.4 * b).toFixed(2) + ")"; ctx.lineWidth = 1; ctx.beginPath();
    for (var i2 = -WH; i2 < WW + WH; i2 += 4) { ctx.moveTo(gx + i2, gy); ctx.lineTo(gx + i2 + WH, gy + WH); ctx.moveTo(gx + i2 + WH, gy); ctx.lineTo(gx + i2, gy + WH); } ctx.stroke(); ctx.restore(); }
  function flower(gx, gy, b, s) { var a = (0.45 + 0.5 * b).toFixed(2);
    ctx.fillStyle = "rgba(150,84,42," + a + ")"; ctx.fillRect(gx + 2, gy + WH - 3, 4, 3);
    ctx.fillStyle = "rgba(79,138,60," + a + ")"; ctx.fillRect(gx + 3, gy + WH - 7, 1, 4);
    ctx.fillStyle = rgba(s.flower, a); ctx.fillRect(gx + 2, gy + WH - 9, 3, 3);
    ctx.fillStyle = "rgba(150,84,42," + a + ")"; ctx.fillRect(gx + WW - 6, gy + WH - 3, 4, 3);
    ctx.fillStyle = "rgba(79,138,60," + a + ")"; ctx.fillRect(gx + WW - 5, gy + WH - 6, 1, 3);
    ctx.fillStyle = rgba(s.flower2, a); ctx.fillRect(gx + WW - 6, gy + WH - 8, 3, 2); }
  function plant(gx, gy, b) { var a = (0.45 + 0.5 * b).toFixed(2), m = gx + WW / 2;
    ctx.fillStyle = "rgba(150,84,42," + a + ")"; ctx.fillRect(m - 2, gy + WH - 3, 4, 3);
    ctx.fillStyle = "rgba(79,138,60," + a + ")"; ctx.fillRect(m - 3, gy + WH - 7, 2, 4); ctx.fillRect(m + 1, gy + WH - 8, 2, 5); ctx.fillRect(m - 1, gy + WH - 10, 2, 6);
    ctx.fillStyle = "rgba(53,96,38," + a + ")"; ctx.fillRect(m, gy + WH - 6, 1, 3); }
  function personStand(gx, gy, b, s) { var a = (0.18 + 0.72 * b).toFixed(2), c = "rgba(9,6,2," + a + ")", px = s.side ? gx + WW - 6 : gx + 2;
    ctx.fillStyle = c; ctx.fillRect(px + 1, gy + 2, 3, 3); ctx.fillRect(px, gy + 5, 5, WH - 5); }
  function personSit(gx, gy, b) { var a = (0.18 + 0.72 * b).toFixed(2), c = "rgba(9,6,2," + a + ")", m = gx + WW / 2;
    ctx.fillStyle = c; ctx.fillRect(m - 1, gy + WH - 6, 3, 3); ctx.fillRect(m - 3, gy + WH - 3, 7, 3); }
  function cat(gx, gy, b, s) {
    var t = ((T + s.animPhase) % s.animPer) / s.animPer;   // hop onto the sill, sit a while, leave
    if (t > 0.5) return; var lo = t / 0.5, yoff = 0;
    if (lo < 0.12) { var j = lo / 0.12; yoff = (1 - j) * 6 - Math.sin(j * Math.PI) * 3; }
    var a = (0.2 + 0.7 * b).toFixed(2), c = "rgba(8,5,2," + a + ")", y = gy + WH - 3 + Math.round(yoff);
    ctx.fillStyle = c; ctx.fillRect(gx + 2, y, 6, 3); ctx.fillRect(gx + 7, y - 2, 3, 3);
    ctx.fillRect(gx + 7, y - 3, 1, 1); ctx.fillRect(gx + 9, y - 3, 1, 1); ctx.fillRect(gx + 1, y - 1, 1, 2); }
  function dog(gx, gy, b) { var a = (0.2 + 0.7 * b).toFixed(2), c = "rgba(8,5,2," + a + ")", y = gy + WH - 4;
    ctx.fillStyle = c; ctx.fillRect(gx + 2, y, 8, 3); ctx.fillRect(gx + 9, y - 2, 3, 3); ctx.fillRect(gx + 8, y - 3, 1, 1);
    ctx.fillRect(gx + 3, y + 3, 1, 1); ctx.fillRect(gx + 8, y + 3, 1, 1); ctx.fillRect(gx + 1, y + 1, 1, 1); }
  function lamp(gx, gy, b, s) { var fl = 0.85 + 0.15 * Math.sin(T * 0.01 + s.animPhase), g = ((0.35 + 0.5 * b) * fl).toFixed(2), m = gx + WW / 2;
    ctx.fillStyle = "rgba(70,52,24," + (0.5 + 0.4 * b).toFixed(2) + ")"; ctx.fillRect(m - 2, gy + 1, 5, 2);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(255,224,150," + g + ")"; ctx.fillRect(m - 2, gy + 3, 5, 4);
    ctx.fillStyle = "rgba(255,242,205," + (g * 0.8).toFixed(2) + ")"; ctx.fillRect(m - 1, gy + 3, 3, 3);
    ctx.globalCompositeOperation = "source-over"; }
  function tv(gx, gy, b, s) { var fl = 0.55 + 0.45 * Math.sin(T * 0.018 + s.animPhase), g = ((0.25 + 0.5 * b) * fl).toFixed(2);
    ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgba(120,165,205," + g + ")"; ctx.fillRect(gx + 2, gy + WH - 6, WW - 4, 5); ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(12,9,4," + (0.3 + 0.5 * b).toFixed(2) + ")"; ctx.fillRect(gx + 1, gy + WH - 2, WW - 2, 2);
    ctx.fillStyle = "rgba(9,6,2," + (0.25 + 0.6 * b).toFixed(2) + ")"; ctx.fillRect(gx + WW / 2 - 1, gy + WH - 4, 3, 3); }
  function clutter(gx, gy, b) { var a = (0.4 + 0.45 * b).toFixed(2);
    ctx.fillStyle = "rgba(46,34,18," + a + ")"; ctx.fillRect(gx + 2, gy + WH - 5, 5, 5);
    ctx.fillStyle = "rgba(60,46,24," + a + ")"; ctx.fillRect(gx + 7, gy + WH - 3, 4, 3);
    ctx.fillStyle = "rgba(30,22,12," + a + ")"; ctx.fillRect(gx + 1, gy + 2, WW - 2, 1); }

  function circle(cx, cy, r, c) { ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke(); }
  function bike(bx2, by2, b) { var c = "rgba(12,8,3," + (0.3 + 0.6 * b).toFixed(2) + ")";
    circle(bx2 + 2, by2 + 5, 2, c); circle(bx2 + 9, by2 + 5, 2, c);
    ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(bx2 + 2, by2 + 5); ctx.lineTo(bx2 + 6, by2 + 5); ctx.lineTo(bx2 + 5, by2 + 1); ctx.lineTo(bx2 + 9, by2 + 5);
    ctx.moveTo(bx2 + 6, by2 + 5); ctx.lineTo(bx2 + 5, by2 + 1); ctx.moveTo(bx2 + 4, by2 + 1); ctx.lineTo(bx2 + 6, by2 + 1); ctx.stroke(); }
  function laundry(lx, ly, b) { var a = (0.55 + 0.35 * b).toFixed(2), cl = ["rgba(232,224,208," + a + ")", "rgba(120,150,185," + a + ")", "rgba(176,70,50," + a + ")"];
    ctx.fillStyle = "rgba(20,14,6," + a + ")"; ctx.fillRect(lx, ly, WW, 1);
    for (var i2 = 0; i2 < 4; i2++) { ctx.fillStyle = cl[i2 % 3]; ctx.fillRect(lx + 1 + i2 * 3, ly + 1, 2, 3); } }

  function drawContent(s, gx, gy, b) {
    switch (s.type) {
      case "curtains": curtains(gx, gy, b, s); break;
      case "blinds": blinds(gx, gy, b); break;
      case "grate": grate(gx, gy, b); break;
      case "flower": flower(gx, gy, b, s); break;
      case "plant": plant(gx, gy, b); break;
      case "stand": personStand(gx, gy, b, s); break;
      case "sit": personSit(gx, gy, b); break;
      case "cat": cat(gx, gy, b, s); break;
      case "dog": dog(gx, gy, b); break;
      case "lamp": lamp(gx, gy, b, s); break;
      case "tv": tv(gx, gy, b, s); break;
      case "clutter": clutter(gx, gy, b); break;
    }
  }

  function bright(idx) { return Math.min(1, wb[idx] + clk[idx] * 0.85 + hov[idx] * 0.9); }

  function drawWindow(c, f) {
    var idx = f * COLS + c, s = cell[idx], b = bright(idx); effB[idx] = b;
    var x = winX(c), y = winY(f);
    if (s.bal) { drawBalcony(x, y, b, s); return; }
    ctx.fillStyle = s.frame; ctx.fillRect(x, y, cellW, cellH);
    var gx = x + FR, gy = y + FR;
    if (s.type === "boarded") {
      ctx.fillStyle = "#3a2a16"; ctx.fillRect(gx, gy, WW, WH);
      ctx.fillStyle = "#2a1d10"; for (var yy = gy + 1; yy < gy + WH; yy += 3) ctx.fillRect(gx, yy, WW, 1);
      ctx.fillStyle = "rgba(20,14,6,0.8)"; ctx.fillRect(gx + WW / 2 - 1, gy, 2, WH); effB[idx] = 0; return;
    }
    ctx.fillStyle = glass(b); ctx.fillRect(gx, gy, WW, WH);
    if (b > 0.05) { ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgba(232,176,86," + (b * 0.36).toFixed(3) + ")"; ctx.fillRect(x - 1, y - 1, cellW + 2, cellH + 2); ctx.globalCompositeOperation = "source-over"; }
    drawContent(s, gx, gy, b);
    ctx.fillStyle = b > 0.4 ? "rgba(10,8,4,0.5)" : "rgba(10,8,4,0.78)";
    ctx.fillRect(gx + WW / 2 - 1, gy, 1, WH); ctx.fillRect(gx, gy + Math.round(WH * 0.42), WW, 1);
  }

  function drawBalcony(x, y, b, s) {
    var gx = x + FR, gy = y + FR, ih = Math.round(WH * 0.72), fy = gy + ih;
    ctx.fillStyle = "#160f07"; ctx.fillRect(x, y, cellW, cellH);
    ctx.fillStyle = glass(b * 0.92); ctx.fillRect(gx, gy, WW, ih);
    if (b > 0.05) { ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = "rgba(232,176,86," + (b * 0.3).toFixed(3) + ")"; ctx.fillRect(gx - 1, gy - 1, WW + 2, ih + 2); ctx.globalCompositeOperation = "source-over"; }
    ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, WW, ih); ctx.clip();
    if (s.clutter === "skis") { ctx.strokeStyle = "rgba(201,168,106," + (0.55 + 0.35 * b).toFixed(2) + ")"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(gx + 2, gy + ih); ctx.lineTo(gx + WW - 2, gy); ctx.moveTo(gx + 4, gy + ih); ctx.lineTo(gx + WW, gy); ctx.stroke(); }
    else if (s.clutter === "bike") bike(gx, gy + ih - 11, b);
    else if (s.clutter === "laundry") laundry(gx, gy + 2, b);
    else if (s.clutter === "boxes") { var a = (0.5 + 0.4 * b).toFixed(2); ctx.fillStyle = "rgba(40,30,16," + a + ")"; ctx.fillRect(gx + 2, gy + ih - 6, 5, 6); ctx.fillRect(gx + 8, gy + ih - 4, 4, 4); }
    else if (s.clutter === "plant") { var a2 = (0.5 + 0.4 * b).toFixed(2); ctx.fillStyle = "rgba(79,138,60," + a2 + ")"; ctx.fillRect(gx + WW - 5, gy + ih - 7, 3, 7); ctx.fillRect(gx + WW - 6, gy + ih - 9, 5, 3); }
    ctx.restore();
    ctx.fillStyle = "#5a4a2c"; ctx.fillRect(x + 1, fy, cellW - 2, (y + cellH) - fy - 1);
    ctx.fillStyle = "rgba(36,26,12,0.55)"; for (var vx = x + 2; vx < x + cellW - 2; vx += 3) ctx.fillRect(vx, fy, 1, (y + cellH) - fy - 1);
    ctx.fillStyle = "#120d06"; ctx.fillRect(x + 1, fy - 1, cellW - 2, 1);
    ctx.fillStyle = "rgba(18,13,6,0.8)"; for (var rx = x + 2; rx < x + cellW - 2; rx += 3) ctx.fillRect(rx, fy - 3, 1, 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x, y + cellH - 1, cellW, 1);
  }

  function drawWalkers() {
    for (var i2 = 0; i2 < walkers.length; i2++) {
      var w = walkers[i2], idx = w.f * COLS + w.c, b = effB[idx];
      if (b < 0.22) continue;
      var t = (T + w.phase) % w.per; if (t > 1700) continue;
      var p = t / 1700, x = winX(w.c), y = winY(w.f), gx = x + FR, gy = y + FR;
      var px = Math.round(gx - 3 + p * (WW + 6));
      ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, WW, WH); ctx.clip();
      var a = (0.3 + 0.55 * b).toFixed(2); ctx.fillStyle = "rgba(7,5,2," + a + ")";
      ctx.fillRect(px, gy + 1, 3, 3); ctx.fillRect(px, gy + 4, 3, WH - 6);
      var leg = Math.sin(p * Math.PI * 7) > 0;
      ctx.fillRect(px, gy + WH - 2, 1, 2); ctx.fillRect(px + 2, gy + WH - 2, 1, 2);
      if (leg) ctx.fillRect(px - 1, gy + WH - 1, 1, 1); else ctx.fillRect(px + 3, gy + WH - 1, 1, 1);
      ctx.restore();
    }
  }

  /* ============================ facade extras ====================== */
  function drawSeams() {
    var k;
    for (k = 0; k <= COLS; k++) { ctx.fillStyle = SEAM; ctx.fillRect(Math.round(bx + k * (cellW + GX) + GX / 2), by, 1, bh); }
    for (k = 0; k <= FLOORS; k++) { var y = Math.round(by + k * (cellH + GY) + GY / 2); ctx.fillStyle = SEAM; ctx.fillRect(bx, y, bw, 1); ctx.fillStyle = SEAM_HI; ctx.fillRect(bx, y + 1, bw, 1); }
  }
  function drawAccents() { for (var c in ACCENTS) { c = +c; ctx.fillStyle = rgba(ACCENTS[c], 1); ctx.fillRect(Math.round(bx + c * (cellW + GX) + GX / 2), by, cellW + GX, bh); } }
  function drawStreaks() { ctx.fillStyle = "rgba(18,12,5,0.16)"; for (var c = 0; c < COLS; c++) if (streak[c]) ctx.fillRect(winX(c) + 1, by, cellW - 2, bh); }
  function drawAC() { for (var f = 0; f < FLOORS; f++) for (var c = 0; c < COLS; c++) { var s = cell[f * COLS + c]; if (!s.ac) continue; var x = winX(c) + 3, y = winY(f) + cellH + 1; ctx.fillStyle = "#b8b09c"; ctx.fillRect(x, y, WW - 2, 4); ctx.fillStyle = "#7a7464"; ctx.fillRect(x, y, WW - 2, 1); ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(x, y + 4, WW - 2, 1); ctx.fillStyle = "#4f4a3e"; ctx.fillRect(x + WW - 4, y + 4, 1, 4); } }
  function drawPipe() { ctx.fillStyle = "#2a2114"; ctx.fillRect(PIPE_X, by - ROOF, 3, bh + ROOF); ctx.fillStyle = "rgba(120,100,60,0.22)"; ctx.fillRect(PIPE_X, by - ROOF, 1, bh + ROOF); ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(PIPE_X + 2, by - ROOF, 1, bh + ROOF); for (var y = by + 6; y < by + bh; y += 42) { ctx.fillStyle = "#15110a"; ctx.fillRect(PIPE_X - 1, y, 5, 2); } }
  function drawDish() { ctx.fillStyle = "#9b9484"; ctx.beginPath(); ctx.arc(DISH.x, DISH.y, 3.5, 0, 6.2832); ctx.fill(); ctx.strokeStyle = "rgba(20,16,8,0.6)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(DISH.x, DISH.y, 3.5, 0, 6.2832); ctx.stroke(); ctx.fillStyle = "#5a5446"; ctx.fillRect(DISH.x - 1, DISH.y - 1, 2, 2); ctx.strokeStyle = "#15110a"; ctx.beginPath(); ctx.moveTo(DISH.x, DISH.y + 3); ctx.lineTo(DISH.x + 2, DISH.y + 6); ctx.stroke(); }
  function drawGraffiti() { var x = bx + 8, y = by + bh - 16; ctx.fillStyle = "rgba(192,68,10,0.85)"; ctx.fillRect(x, y, 8, 1); ctx.fillRect(x + 5, y + 1, 1, 1); ctx.fillRect(x + 4, y + 2, 1, 1); ctx.fillRect(x + 3, y + 3, 1, 1); ctx.fillRect(x + 2, y + 4, 1, 1); ctx.fillRect(x, y + 5, 8, 1); }
  function drawDoor() { var dw = cellW + GX, dx = Math.round(bx + bw / 2 - dw / 2); ctx.fillStyle = DOOR; ctx.fillRect(dx, by + bh - 4, dw, BASE + 4); ctx.fillStyle = FAC_LO; ctx.fillRect(dx - 3, by + bh - 6, dw + 6, 4); ctx.fillStyle = "rgba(232,197,106,0.6)"; ctx.fillRect(dx + dw / 2 - 2, by + bh - 4, 4, 3); }

  var RAIN_WIND = 0.34;   // horizontal drift per vertical px — slight slant, as if wind
  function drawRain() {
    if (!drops) {
      drops = [];
      var count = Math.round(CW / 4.5);
      for (var i = 0; i < count; i++) {
        drops.push({ x: Math.random() * CW, y: Math.random() * CH, len: 5 + Math.random() * 8, sp: 1.2 + Math.random() * 1.5, hot: Math.random() < 0.3 });
      }
    }
    // cold night tint over the warm house, then slow slanted pixel streaks
    ctx.fillStyle = "rgba(26,42,68,0.16)"; ctx.fillRect(0, 0, CW, CH);
    for (var j = 0; j < drops.length; j++) {
      var d = drops[j], steps = d.len | 0;
      ctx.fillStyle = d.hot ? "rgba(216,232,246,0.78)" : "rgba(158,186,214,0.55)";
      for (var s = 0; s < steps; s++) ctx.fillRect((d.x + s * RAIN_WIND) | 0, (d.y + s) | 0, 1, 1);
      d.y += d.sp;
      d.x += d.sp * RAIN_WIND;
      if (d.y > CH) { d.y = -d.len; d.x = Math.random() * CW; }
      else if (d.x > CW) d.x -= CW; else if (d.x < 0) d.x += CW;
    }
    // --- wet, reflective ground with puddles ---
    ctx.fillStyle = "rgba(64,94,130,0.20)"; ctx.fillRect(0, CH - 11, CW, 11);   // wet sheen across the ground
    if (!puddles) {
      puddles = [];
      var pn = 5;
      for (var p = 0; p < pn; p++) {
        puddles.push({ cx: (CW / (pn + 1)) * (p + 1) + (Math.random() * 22 - 11), w: 44 + Math.random() * 50, ph: Math.random() * 6.28 });
      }
    }
    var py = CH - 8;
    for (var pj = 0; pj < puddles.length; pj++) {
      var pu = puddles[pj], hw = pu.w / 2;
      ctx.fillStyle = "rgba(96,128,164,0.42)"; ctx.fillRect((pu.cx - hw) | 0, py, pu.w | 0, 5);
      ctx.fillStyle = "rgba(206,228,246,0.55)"; ctx.fillRect((pu.cx - hw + 2) | 0, py, (pu.w - 4) | 0, 1);   // bright reflection edge
      var sh = pu.cx - hw + 3 + (0.5 + 0.5 * Math.sin(T * 0.003 + pu.ph)) * (pu.w - 8);
      ctx.fillStyle = "rgba(240,248,255,0.7)"; ctx.fillRect(sh | 0, py + 2, 4, 1);                            // moving shimmer
      ctx.fillStyle = "rgba(232,197,106,0.34)"; ctx.fillRect((pu.cx - hw + pu.w * 0.34) | 0, py + 3, 2, 1);   // warm house-light reflection
    }
    for (var tk = 0; tk < 3; tk++) {
      var pk = puddles[(Math.random() * puddles.length) | 0];
      ctx.fillStyle = "rgba(226,242,255,0.6)";
      ctx.fillRect((pk.cx - pk.w / 2 + Math.random() * pk.w) | 0, py - 1 - ((Math.random() * 3) | 0), 1, 2);
    }
  }

  function draw() {
    ctx.fillStyle = SKY; ctx.fillRect(0, 0, CW, CH);
    var g = ctx.createRadialGradient(CW / 2, by - 4, 8, CW / 2, by - 4, CW * 0.7);
    g.addColorStop(0, "rgba(122,82,32,0.30)"); g.addColorStop(1, "rgba(122,82,32,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, by + 24);

    ctx.fillStyle = FAC; ctx.fillRect(bx, by, bw, bh);
    drawAccents(); drawStreaks(); drawSeams();
    drawPipe(); drawAC(); drawDish(); drawGraffiti();

    ctx.fillStyle = FAC_LO; ctx.fillRect(bx, by - ROOF, bw, ROOF);
    ctx.fillStyle = SEAM_HI; ctx.fillRect(bx, by - ROOF, bw, 2);
    ctx.fillStyle = SEAM; ctx.fillRect(bx + bw - 14, by - ROOF - 11, 1, 11); ctx.fillRect(bx + bw - 18, by - ROOF - 11, 9, 1);
    ctx.fillStyle = FAC_LO; ctx.fillRect(bx + 22, by - ROOF - 8, 8, 8); ctx.fillStyle = SEAM; ctx.fillRect(bx + 22, by - ROOF - 9, 8, 1);

    ctx.fillStyle = GROUND; ctx.fillRect(0, by + bh, CW, CH - (by + bh));
    ctx.fillStyle = FAC_LO; ctx.fillRect(bx, by + bh, bw, BASE - 6);
    drawDoor();

    for (var c = 0; c < COLS; c++) for (var f = 0; f < FLOORS; f++) drawWindow(c, f);
    drawWalkers();
    if (rainOn) drawRain();
  }

  /* ---- loop ---- */
  var raf = 0, running = false;
  function frame(now) { if (!running) return; raf = requestAnimationFrame(frame); T = now; step(now); draw(); }
  function play() { if (running || reduce) return; running = true; raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  if (reduce) {
    for (i = 0; i < N; i++) wb[i] = home[i] ? 0.62 : (i % 6 === 0 ? 0.4 : 0.07);
    for (i = 0; i < N; i++) effB[i] = wb[i];
    draw();
  } else {
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) play(); else stop(); }); }, { threshold: 0.04 }).observe(canvas);
    else play();
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else play(); });
  }

  /* ---- interaction: torch on hover, charge on click ---- */
  function torch(clientX, clientY, strength) {
    var rect = canvas.getBoundingClientRect();
    var cx = (clientX - rect.left) / rect.width * CW, cy = (clientY - rect.top) / rect.height * CH, Rr = 88;
    for (var f = 0; f < FLOORS; f++) for (var c = 0; c < COLS; c++) {
      var dx = winX(c) + cellW / 2 - cx, dy = winY(f) + cellH / 2 - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d < Rr) { var idx = f * COLS + c, v = (1 - d / Rr) * (strength || 0.9); if (v > hov[idx]) hov[idx] = v; }
    }
  }
  var screen = document.getElementById("eq-screen");
  if (screen && !reduce) {
    screen.addEventListener("pointermove", function (e) { torch(e.clientX, e.clientY, 1); });
    screen.addEventListener("pointerdown", function (e) { clickCharge = Math.min(1.6, clickCharge + 0.16); torch(e.clientX, e.clientY, 1); });
  }

  /* ---- public hook: player.js drives play/pause + real spectrum ---- */
  window.ZALTURI_EQ = {
    setRain: function (on) { rainOn = !!on; },
    setPlaying: function (on) { playing = !!on; if (!on) realAt = 0; },
    setBands: function (arr) {
      realBands = arr;
      realAt = (window.performance && performance.now) ? performance.now() : Date.now();
      playing = true;
    }
  };
})();
