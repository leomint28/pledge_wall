/* =====================================================================
   Wall (TV) logic
   /wall               live: Supabase Realtime (inserts + deletes)
   /wall?demo=1        demo: fake pledges, nothing is saved
   /wall?demo=burst    demo with a rush of pledges (tests gust mode)
   /wall?demo=still    demo with no new pledges (for testing)
   Small leaves show the first name; the full message appears in the
   spotlight and when a leaf is clicked. Grass sways along the bottom.
   ===================================================================== */
(function () {
  "use strict";

  var D = window.PLEDGE_DATA;
  var CFG = window.PLEDGE_CONFIG || {};
  var params = new URLSearchParams(location.search);
  var DEMO = params.get("demo");
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var COLS = "id,created_at,display_name,preset_id,custom_text,topic,leaf_color,source,lang,translation,translation_lang";

  var SPOT_MS = 4000;        // normal spotlight
  var GUST_SPOT_MS = 1500;   // spotlight in gust mode
  var GAP_MS = 1500;         // between arrivals
  var GUST_AT = 4;           // more than this waiting -> gust mode (4 leaves at a time)
  var CATCHUP_AT = 25;       // more than this waiting -> older ones go straight in
  var CATCHUP_KEEP = 8;      // ...keeping this many to animate
  var CARD_MS = 10000;       // a clicked leaf returns after 10 s
  var IDLE_MS = 5000;        // hide the mouse after 5 s

  var $ = function (id) { return document.getElementById(id); };
  var wallEl = $("wall"), field = $("field"), layer = $("leaves");

  // ---------- state
  var leaves = new Map();   // id -> { row, el, x, y }
  var order = [];           // ids, oldest first
  var queue = [];           // rows waiting to fly in
  var counts = {};          // topic -> n
  var busy = false;
  var manualOpen = false;   // a leaf was clicked and is in front
  var cardTimer = null;
  var shownId = null;

  // ---------- helpers
  function rand(a, b) { return a + Math.random() * (b - a); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function waitUntil(fn) {
    return new Promise(function (r) { (function check() { if (fn()) r(); else setTimeout(check, 200); })(); });
  }
  function leafPx() {
    var p = document.createElement("div");
    p.style.cssText = "position:absolute;visibility:hidden;width:var(--leaf)";
    document.body.appendChild(p);
    var w = p.getBoundingClientRect().width;
    p.remove();
    return w || 64;
  }
  // height of the grass that overlaps the bottom of the field (leaves stay above it)
  function grassTop() { return $("grass").getBoundingClientRect().height * 0.8; }
  function topicName(id, lang) { var t = D.topicById(id); return t ? t[lang === "ar" ? "ar" : "en"] : ""; }
  function colorOf(row) { return row.leaf_color || (D.topicById(row.topic) || {}).color || "#4FA33A"; }

  // ---------- capacity and placement
  function capacity() {
    var r = field.getBoundingClientRect();
    var per = Math.pow(leafPx() * 1.65, 2);
    return Math.max(12, Math.min(220, Math.floor((r.width * r.height) / per)));
  }

  // Pick the free spot furthest from other leaves, away from the QR panel.
  function placement() {
    var fr = field.getBoundingClientRect();
    var qr = $("qrPanel").getBoundingClientRect();
    var lp = leafPx();
    var pad = lp * 0.75;
    var best = null, bestScore = -1;
    for (var i = 0; i < 36; i++) {
      var x = rand(pad, fr.width - pad), y = rand(pad, fr.height - grassTop() - pad * 1.4);
      var ax = fr.left + x, ay = fr.top + y;
      if (ax > qr.left - lp && ax < qr.right + lp && ay > qr.top - lp && ay < qr.bottom + lp) continue;
      // keep clear of the robot's home spot (even while it is out for a walk)
      var rb = window.WallRobot ? window.WallRobot.homeRect() : $("robot").getBoundingClientRect();
      if (ax > rb.left - lp && ax < rb.right + lp && ay > rb.top - lp && ay < rb.bottom + lp) continue;
      var score = Infinity;
      leaves.forEach(function (l) {
        var dx = (l.x / 100) * fr.width - x, dy = (l.y / 100) * fr.height - y;
        score = Math.min(score, dx * dx + dy * dy);
      });
      if (score > bestScore) { bestScore = score; best = { x: x, y: y }; }
    }
    if (!best) best = { x: fr.width * 0.3, y: fr.height * 0.5 };
    return { x: (best.x / fr.width) * 100, y: (best.y / fr.height) * 100 };
  }

  // ---------- leaf elements
  function makeLeaf(row, pos) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "wleaf";
    b.style.left = pos.x + "%";
    b.style.top = pos.y + "%";
    b.style.setProperty("--rot", rand(-38, 30).toFixed(1) + "deg");
    b.style.setProperty("--sway-d", rand(4.5, 8).toFixed(2) + "s");
    b.style.setProperty("--sway-delay", (-rand(0, 8)).toFixed(2) + "s");
    b.style.setProperty("--wave", (pos.x / 100 * 1.6).toFixed(2) + "s");   // breeze travels left to right
    // sway (constant) > gust (breeze) > tilt (fixed angle): each layer animates one plain transform,
    // so the graphics chip can move them without redrawing anything
    b.innerHTML = '<span class="sway"><span class="gust"><span class="tilt">' + D.leafSVG(colorOf(row)) + '</span></span></span><span class="name"></span>';
    b.querySelector(".name").textContent = row.display_name;
    b.setAttribute("aria-label", row.display_name + ": " + D.pledgeText(row));
    b.addEventListener("click", function () { openCard(row, true); });
    return b;
  }

  function register(row, hidden) {
    var pos = placement();
    var el = makeLeaf(row, pos);
    if (hidden) el.classList.add("hidden");
    layer.appendChild(el);
    leaves.set(row.id, { row: row, el: el, x: pos.x, y: pos.y });
    order.push(row.id);
    $("empty").hidden = true;
    return leaves.get(row.id);
  }

  function enforceCap() {
    var cap = capacity();
    while (order.length > cap) {
      var id = order.shift();
      var l = leaves.get(id);
      leaves.delete(id);
      if (l) {
        l.el.classList.add("drift");
        (function (el) { setTimeout(function () { el.remove(); }, 2500); })(l.el);
      }
    }
  }

  function addNow(row) {           // no animation (first load, catch-up)
    if (leaves.has(row.id)) return;
    register(row, false);
    enforceCap();
  }

  // ---------- flights (Web Animations API)
  function leafCenter(l) {
    var fr = field.getBoundingClientRect();
    return { x: fr.left + (l.x / 100) * fr.width, y: fr.top + (l.y / 100) * fr.height };
  }
  function flyer(row) {
    var f = document.createElement("div");
    f.className = "flyer";
    f.innerHTML = D.leafSVG(colorOf(row));
    document.body.appendChild(f);
    return f;
  }
  // curved path with a little wind wobble; points are leaf centres
  function fly(f, from, to, ms, scaleFrom, scaleTo) {
    var half = leafPx() / 2;
    if (REDUCED) ms = 1;
    var midX = (from.x + to.x) / 2, midY = Math.min(from.y, to.y) - rand(60, 160);
    var kf = [
      { t: 0,    x: from.x, y: from.y, r: rand(-40, 0), s: scaleFrom },
      { t: 0.35, x: from.x + (midX - from.x) * 0.8, y: midY + rand(-30, 30), r: rand(40, 120), s: (scaleFrom + scaleTo) / 2 },
      { t: 0.7,  x: midX + (to.x - midX) * 0.7, y: to.y - rand(20, 60), r: rand(160, 260), s: scaleTo },
      { t: 1,    x: to.x, y: to.y, r: 360 + rand(-20, 20), s: scaleTo }
    ].map(function (k) {
      return { offset: k.t, transform: "translate(" + (k.x - half) + "px," + (k.y - half) + "px) rotate(" + k.r + "deg) scale(" + k.s + ")" };
    });
    return f.animate(kf, { duration: ms, easing: "cubic-bezier(.35,.1,.25,1)", fill: "forwards" }).finished;
  }
  function startPoint() {
    var fr = field.getBoundingClientRect();
    return { x: -leafPx(), y: fr.top + rand(0.15, 0.85) * fr.height };   // wind blows left to right
  }

  // fly straight to its spot (gust mode)
  function flyStraight(row) {
    var l = register(row, true);
    enforceCap();
    var f = flyer(row);
    return fly(f, startPoint(), leafCenter(l), rand(2000, 2800), 1, 1).then(function () {
      l.el.classList.remove("hidden");
      f.remove();
    });
  }

  // fly to the centre, show it big, then settle into its spot
  function spotlight(row, holdMs, quick) {
    var l = register(row, true);
    enforceCap();
    var f = flyer(row);
    var c = { x: innerWidth / 2, y: innerHeight / 2 };
    var inMs = quick ? 1100 : 1800, outMs = quick ? 900 : 1400;
    return fly(f, startPoint(), c, inMs, 1, 2.2)
      .then(function () { return waitUntil(function () { return !manualOpen; }); })
      .then(function () {
        if (!leaves.has(row.id)) { f.remove(); return; }   // deleted meanwhile
        f.style.visibility = "hidden";
        showCard(row, false);
        if (window.WallRobot) window.WallRobot.react("happy");
        return wait(holdMs);
      })
      .then(function () {
        if (!leaves.has(row.id)) { f.remove(); return; }
        return hideCard().then(function () {
          f.style.visibility = "";
          return fly(f, c, leafCenter(l), outMs, 2.2, 1);
        }).then(function () {
          l.el.classList.remove("hidden");
          f.remove();
        });
      });
  }

  // ---------- arrival queue (normal, gust, catch-up)
  function enqueue(row) {
    if (leaves.has(row.id) || queue.some(function (q) { return q.id === row.id; })) return;
    queue.push(row);
    countAdd(row);
    pump();
  }

  function pump() {
    if (busy || !queue.length) return;
    busy = true;
    var job;
    if (queue.length > CATCHUP_AT) {
      // far behind: older ones go straight in without flights
      queue.splice(0, queue.length - CATCHUP_KEEP).forEach(function (row) { addNow(row); });
      job = Promise.resolve();
    } else if (queue.length > GUST_AT) {
      // gust: 4 leaves blow in together; the first gets a short spotlight
      var batch = queue.splice(0, 4);
      job = Promise.all([spotlight(batch[0], GUST_SPOT_MS, true)].concat(batch.slice(1).map(function (row, i) {
        return wait(i * 250).then(function () { return flyStraight(row); });
      })));
    } else {
      job = spotlight(queue.shift(), SPOT_MS);
    }
    job.catch(function () {}).then(function () {
      return wait(queue.length > GUST_AT ? 200 : GAP_MS);
    }).then(function () { busy = false; pump(); });
  }

  // ---------- removal (deleted by staff)
  function remove(id) {
    queue = queue.filter(function (q) { return q.id !== id; });
    var l = leaves.get(id);
    leaves.delete(id);
    order = order.filter(function (x) { return x !== id; });
    if (l) {
      if (shownId === id) { if (manualOpen) closeManual(); else hideCard(); }
      l.el.classList.add("wither");
      setTimeout(function () { l.el.remove(); }, 1200);
    }
    countRemoved();
    if (!leaves.size && !queue.length) $("empty").hidden = false;
  }

  // ---------- front card
  function showCard(row, manual) {
    shownId = row.id;
    $("card").style.setProperty("--c", colorOf(row));
    $("cardLeaf").innerHTML = D.leafSVG(colorOf(row));
    $("cardName").textContent = row.display_name;
    $("cardText").textContent = D.pledgeText(row);
    $("cardText").lang = row.lang;
    showTranslation(row);
    var time = new Date(row.created_at).toLocaleTimeString(row.lang === "ar" ? "ar-AE" : "en-GB", { hour: "2-digit", minute: "2-digit" });
    $("cardMeta").innerHTML = "<span></span><span></span>";
    $("cardMeta").firstChild.textContent = topicName(row.topic, row.lang);
    $("cardMeta").lastChild.textContent = time;
    $("focus").classList.remove("closing");
    $("focus").hidden = false;
    wallEl.classList.toggle("dimmed", manual);
  }
  // small translation line under the message (preset: built in; custom: from Groq)
  function showTranslation(row) {
    var tr = D.pledgeTranslation(row), el = $("cardTrans");
    el.textContent = tr ? tr.text : "";
    el.lang = tr ? tr.lang : "";
    el.hidden = !tr;
  }
  // a translation arrived for a pledge (live UPDATE)
  function updateRow(row) {
    var l = leaves.get(row.id);
    if (l) Object.assign(l.row, row);   // in place, so a pledge mid-flight to the spotlight gets it too
    queue.forEach(function (q) { if (q.id === row.id) Object.assign(q, row); });
    if (shownId === row.id) showTranslation(l ? l.row : row);
  }
  function hideCard() {
    return new Promise(function (resolve) {
      if ($("focus").hidden) return resolve();
      $("focus").classList.add("closing");
      setTimeout(function () {
        $("focus").hidden = true;
        $("focus").classList.remove("closing");
        wallEl.classList.remove("dimmed");
        shownId = null;
        resolve();
      }, REDUCED ? 0 : 330);
    });
  }
  function openCard(row, manual) {
    if (!$("focus").hidden) return;   // a spotlight is on screen
    manualOpen = true;
    showCard(row, manual);
    clearTimeout(cardTimer);
    cardTimer = setTimeout(closeManual, CARD_MS);
  }
  function closeManual() {
    if (!manualOpen) return;
    clearTimeout(cardTimer);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // no focus box left on the leaf
    hideCard().then(function () { manualOpen = false; });
  }
  $("focus").addEventListener("click", function (e) { if (manualOpen && e.target === $("focus")) closeManual(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeManual(); });

  // ---------- total counter
  function renderCounts(bump) {
    var total = 0;
    Object.keys(counts).forEach(function (k) { total += counts[k]; });
    var el = $("total");
    el.textContent = total.toLocaleString("en");
    if (bump) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
  }
  function countAdd(row) { counts[row.topic] = (counts[row.topic] || 0) + 1; renderCounts(true); }
  var countRemoved = function () {};

  // ---------- grass along the bottom
  // The grass is cut into patches. Each patch is drawn once and then only
  // moved (skewed from its base) by the graphics chip, so it stays smooth on a TV.
  function buildGrass() {
    var box = $("grass");
    var W = Math.ceil(box.clientWidth), H = Math.ceil(box.clientHeight);
    if (!W || !H) return;
    var layers = [
      { colors: ["#9CC98A", "#A9D497"], hMin: 0.55, hMax: 0.8,  step: 7,  wMin: 7,  wMax: 12 },
      { colors: ["#6FAA5D", "#7DB86A"], hMin: 0.6,  hMax: 0.95, step: 9,  wMin: 8,  wMax: 14 },
      { colors: ["#4C8A43", "#5A9A4E"], hMin: 0.45, hMax: 0.75, step: 11, wMin: 9,  wMax: 16 }
    ];
    var scale = Math.max(1, W / 1600);          // wider blades on big screens
    var patchW = Math.max(120, Math.round(W / 11));   // ~11 patches per layer: fewer moving pieces
    var html = "";
    layers.forEach(function (L, li) {
      var step = L.step * scale;
      for (var px = -patchW / 2 * (li % 2); px < W; px += patchW) {
        var paths = "";
        for (var x = 0; x < patchW; x += step * rand(0.6, 1.4)) {
          var h = H * rand(L.hMin, L.hMax), w = rand(L.wMin, L.wMax) * scale, lean = rand(-0.3, 0.3) * h;
          var tipX = x + w / 2 + lean, y0 = H + 2;
          paths += '<path fill="' + L.colors[Math.random() < 0.5 ? 0 : 1] + '" d="M' + x.toFixed(1) + " " + y0 +
            " Q" + (x + lean * 0.35).toFixed(1) + " " + (y0 - h * 0.55).toFixed(1) + " " + tipX.toFixed(1) + " " + (y0 - h).toFixed(1) +
            " Q" + (x + w + lean * 0.3).toFixed(1) + " " + (y0 - h * 0.5).toFixed(1) + " " + (x + w).toFixed(1) + " " + y0 + 'Z"/>';
        }
        var center = (px + patchW / 2) / W;
        html += '<div class="patch" style="left:' + px.toFixed(0) + "px;width:" + patchW + "px;--wave:" + (center * 1.6).toFixed(2) + 's">' +
          '<div class="patch-sway" style="animation-duration:' + rand(3.5, 6.5).toFixed(2) + "s;animation-delay:" + (-rand(0, 6)).toFixed(2) + 's">' +
          '<svg width="' + patchW + '" height="' + H + '" viewBox="0 0 ' + patchW + " " + H + '">' + paths + "</svg></div></div>";
      }
    });
    box.innerHTML = html;
  }

  // ---------- wind streaks + breeze
  function buildWind() {
    var box = $("wind");
    var html = "";
    for (var i = 0; i < 7; i++) {
      var y = 6 + i * 13 + rand(-3, 3);                 // % from the top of the field
      var a = rand(-6, 6);
      html += '<div class="streak" style="top:' + y.toFixed(1) + "%;animation-duration:" + rand(9, 17).toFixed(1) +
        "s;animation-delay:" + (-rand(0, 17)).toFixed(1) + 's">' +
        '<svg viewBox="0 0 300 30" preserveAspectRatio="none"><defs><linearGradient id="wg' + i + '">' +
        '<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/>' +
        '<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
        '<path d="M2 15 C 70 ' + (15 + a) + ", 130 " + (15 - a) + ", 200 " + (15 + a / 2) + " S 280 " + (15 - a / 2) + ', 298 15" ' +
        'fill="none" stroke="url(#wg' + i + ')" stroke-width="' + rand(1.6, 2.8).toFixed(1) + '" stroke-linecap="round"/></svg></div>';
    }
    box.innerHTML = html;
  }
  function breeze() {
    if (REDUCED) return;
    [layer, $("grass")].forEach(function (el) {   // the breeze moves leaves and grass together
      el.classList.remove("breeze");
      void el.offsetWidth;
      el.classList.add("breeze");
    });
    setTimeout(function () { layer.classList.remove("breeze"); $("grass").classList.remove("breeze"); }, 4600);
    setTimeout(breeze, rand(16000, 28000));
  }

  // ---------- QR code to the pledge page
  function buildQR() {
    var url = params.get("pledgeUrl") || (location.origin + "/pledge");
    var qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    $("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    $("qrUrl").textContent = url.replace(/^https?:\/\//, "");
  }

  // ---------- mouse hides when idle
  var idleTimer;
  function wake() {
    document.body.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { document.body.classList.add("idle"); }, IDLE_MS);
  }
  document.addEventListener("mousemove", wake);
  document.addEventListener("mousedown", wake);

  // ---------- resize: positions are percentages; only the cap changes
  var resizeT;
  window.addEventListener("resize", function () { clearTimeout(resizeT); resizeT = setTimeout(function () { buildGrass(); enforceCap(); }, 300); });

  function status(msg) { $("status").textContent = msg || ""; $("status").hidden = !msg; }

  // ---------- data source: Supabase (live)
  function startLive() {
    var sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });

    function loadCounts() {
      return Promise.all(D.TOPICS.map(function (t) {
        return sb.from("pledges").select("id", { count: "exact", head: true }).eq("topic", t.id)
          .then(function (r) { return [t.id, r.count || 0]; });
      })).then(function (pairs) {
        counts = {};
        pairs.forEach(function (p) { counts[p[0]] = p[1]; });
        renderCounts(false);
      });
    }
    var recountT;
    countRemoved = function () { clearTimeout(recountT); recountT = setTimeout(loadCounts, 800); };

    function latest() {
      return sb.from("pledges").select(COLS).order("created_at", { ascending: false }).limit(capacity())
        .then(function (r) { if (r.error) throw r.error; return r.data || []; });
    }

    var first = true;
    function resync() {
      return latest().then(function (rows) {
        if (first) {
          first = false;
          rows.slice().reverse().forEach(function (row) { addNow(row); });
          if (!rows.length) $("empty").hidden = false;
          return loadCounts();
        }
        // after a reconnect: add what we missed, remove what was deleted meanwhile
        var ids = new Set(rows.map(function (r) { return r.id; }));
        var oldest = rows.length ? rows[rows.length - 1].created_at : null;
        var newestShown = order.length ? leaves.get(order[order.length - 1]).row.created_at : null;
        rows.slice().reverse().forEach(function (row) {
          if (!leaves.has(row.id) && !queue.some(function (q) { return q.id === row.id; }) &&
              (!newestShown || row.created_at > newestShown)) {
            queue.push(row);
          }
        });
        leaves.forEach(function (l, id) {
          if (!ids.has(id) && oldest && l.row.created_at >= oldest) remove(id);
        });
        pump();
        return loadCounts();
      }).catch(function () { status("Can't reach the database. Retrying…"); });
    }

    sb.channel("pledge-wall")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pledges" }, function (p) { enqueue(p.new); })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "pledges" }, function (p) { if (p.old && p.old.id) remove(p.old.id); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pledges" }, function (p) { if (p.new && p.new.id) updateRow(p.new); })
      .subscribe(function (st) {
        if (st === "SUBSCRIBED") { status(""); resync(); }
        else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") status("Reconnecting to live pledges…");
      });

    setInterval(function () { if (!first) resync(); }, 60000);   // safety net
  }

  // ---------- data source: demo (nothing saved)
  function startDemo() {
    status("Demo mode: these pledges are not real");
    var names = ["Mariam", "Omar", "Fatima", "Ahmed", "Sara", "Khalid", "Noura", "Yousef", "Aisha", "Hamdan",
      "Layla", "Rashid", "Hessa", "Saeed", "Maitha", "Zayed", "سارة", "محمد", "شما", "علي", "ميثاء", "حمدان"];
    var customs = [
      { t: "I will plant a ghaf tree with my family", l: "en", tr: "سأزرع شجرة غاف مع عائلتي" },
      { t: "I'll bring my own cup to the campus café", l: "en", tr: "سأحضر كوبي الخاص إلى مقهى الجامعة" },
      { t: "سأزرع شجرة في حديقة الجامعة", l: "ar", tr: "I will plant a tree in the university garden" },
      { t: "No more plastic bags when I shop", l: "en", tr: "لا مزيد من الأكياس البلاستيكية عند التسوق" },
      { t: "سأقلل استخدام المكيف عندما لا أحتاجه", l: "ar", tr: "I will use the air conditioner less when I don't need it" }
    ];
    var n = 0, all = [];
    function fake() {
      n++;
      var name = names[Math.floor(Math.random() * names.length)];
      var arName = /[؀-ۿ]/.test(name);
      var row = { id: "demo-" + n, created_at: new Date().toISOString(), display_name: name, source: Math.random() < .7 ? "qr" : "kiosk" };
      if (Math.random() < 0.25) {
        var c = customs[Math.floor(Math.random() * customs.length)];
        row.custom_text = c.t; row.preset_id = null; row.topic = "custom"; row.lang = c.l;
        (function (r, tr) { setTimeout(function () { updateRow({ id: r.id, translation: tr, translation_lang: c.l === "ar" ? "en" : "ar" }); }, 1200); })(row, c.tr);
        row.leaf_color = D.SWATCHES[Math.floor(Math.random() * D.SWATCHES.length)].color;
      } else {
        var p = D.PRESETS[Math.floor(Math.random() * D.PRESETS.length)];
        row.preset_id = p.id; row.custom_text = null; row.topic = p.topic;
        row.lang = arName ? "ar" : "en";
        row.leaf_color = D.topicById(p.topic).color;
      }
      all.push(row);
      return row;
    }
    countRemoved = function () {
      counts = {};
      all.forEach(function (r) { counts[r.topic] = (counts[r.topic] || 0) + 1; });
      renderCounts(false);
    };

    var seed = DEMO === "burst" ? 20 : 30;
    for (var i = 0; i < seed; i++) { addNow(fake()); }
    countRemoved();

    function trickle() { enqueue(fake()); setTimeout(trickle, rand(5000, 9000)); }
    if (DEMO === "still") {
      // no new pledges (for testing)
    } else if (DEMO === "burst") {
      var k = 0;
      var t = setInterval(function () { enqueue(fake()); if (++k >= 40) clearInterval(t); }, 500);
      setTimeout(trickle, 25000);
    } else {
      setTimeout(trickle, 2500);
    }

    // hooks for testing in the browser console
    window.__wall = {
      add: function () { var r = fake(); enqueue(r); return r.id; },
      remove: function (id) { all = all.filter(function (r) { return r.id !== id; }); remove(id); },
      onScreen: function () { return Array.from(leaves.keys()); },
      queueLength: function () { return queue.length; },
      created: function () { return all.length; },
      update: updateRow,
      capacity: capacity
    };
  }

  // ---------- start
  buildWind();
  buildGrass();
  buildQR();
  renderCounts(false);
  wake();
  setTimeout(breeze, 8000);

  if (DEMO) startDemo();
  else if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase) startLive();
  else { status("Not connected: fill in config.js, or open /wall?demo=1 to preview"); $("empty").hidden = false; }
})();
