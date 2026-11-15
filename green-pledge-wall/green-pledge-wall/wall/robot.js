/* =====================================================================
   Little robot in the bottom-left corner of the wall.
   Idle: blinks, glances, tilts its head, waves, hops, wiggles its sprout.
   It walks sideways to the right, stops just before the QR panel, looks
   around, waves, walks back, then rests 30 s at home before the next walk.
   window.WallRobot.react("happy") when a new pledge arrives.
   Moves are CSS classes on #robot; the walk slides the whole robot
   (one already-drawn layer), so it stays smooth.
   ===================================================================== */
(function () {
  "use strict";

  var el = document.getElementById("robot");
  if (!el) return;
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var WALK_FIRST_MS = [30000, 30000];   // first walk 30 s after the wall opens
  var WALK_EVERY_MS = [30000, 30000];   // then 30 s at home (small moves) between walks

  // Drawn in a 120 x 160 box. Parts that move are in their own groups.
  el.innerHTML =
    '<svg viewBox="0 0 120 160" aria-hidden="true">' +
      '<ellipse class="r-shadow" cx="60" cy="154" rx="30" ry="4.5"/>' +
      '<g class="r-all">' +
        // legs and feet (each leg steps on its own when walking)
        '<g class="r-leg-l"><rect x="44" y="128" width="10" height="20" rx="5" class="r-dark"/><rect x="38" y="144" width="20" height="9" rx="4.5" class="r-dark"/></g>' +
        '<g class="r-leg-r"><rect x="66" y="128" width="10" height="20" rx="5" class="r-dark"/><rect x="62" y="144" width="20" height="9" rx="4.5" class="r-dark"/></g>' +
        // arms – pivot at the shoulder
        '<g class="r-arm-l"><rect x="20" y="96" width="11" height="30" rx="5.5" class="r-shell"/><circle cx="25.5" cy="127" r="5.5" class="r-dark"/></g>' +
        '<g class="r-arm-r"><rect x="89" y="96" width="11" height="30" rx="5.5" class="r-shell"/><circle cx="94.5" cy="127" r="5.5" class="r-dark"/></g>' +
        // body with a leaf on the chest
        '<g class="r-body">' +
          '<rect x="30" y="88" width="60" height="44" rx="16" class="r-shell"/>' +
          '<g transform="translate(51 99) scale(.18)"><path d="M8 92 C8 46 38 10 92 8 C90 60 56 92 8 92 Z" fill="#4FA33A"/>' +
          '<path d="M8 92 C34 66 58 40 88 12" fill="none" stroke="rgba(0,0,0,.2)" stroke-width="6" stroke-linecap="round"/></g>' +
        '</g>' +
        // head
        '<g class="r-head">' +
          '<rect x="54" y="80" width="12" height="10" rx="3" class="r-dark"/>' +
          // antenna with a sprout
          '<g class="r-sprout">' +
            '<path d="M60 28 L60 12" stroke="#2F5D46" stroke-width="3" stroke-linecap="round"/>' +
            '<path d="M60 14 C 52 4, 42 6, 40 12 C 46 16, 54 17, 60 14 Z" fill="#6CBF4F"/>' +
            '<path d="M60 12 C 66 1, 77 2, 80 8 C 74 13, 66 14, 60 12 Z" fill="#4FA33A"/>' +
          '</g>' +
          '<circle cx="16" cy="56" r="6" class="r-dark"/><circle cx="104" cy="56" r="6" class="r-dark"/>' +
          '<rect x="18" y="26" width="84" height="60" rx="24" class="r-shell"/>' +
          '<rect x="27" y="36" width="66" height="40" rx="15" class="r-screen"/>' +
          // face (on the screen)
          '<g class="r-face">' +
            '<ellipse cx="46" cy="58" rx="5" ry="2.6" class="r-cheek"/><ellipse cx="74" cy="58" rx="5" ry="2.6" class="r-cheek"/>' +
            '<g class="r-eyes">' +
              '<g class="r-eye r-eye-l"><rect x="39" y="44" width="10" height="13" rx="5" class="r-glow"/></g>' +
              '<g class="r-eye r-eye-r"><rect x="71" y="44" width="10" height="13" rx="5" class="r-glow"/></g>' +
              '<g class="r-happy-eyes">' +
                '<path d="M38 52 Q44 43 50 52" class="r-line"/><path d="M70 52 Q76 43 82 52" class="r-line"/>' +
              '</g>' +
            '</g>' +
            '<path class="r-mouth" d="M53 63 Q60 69 67 63" />' +
            '<path class="r-mouth-big" d="M51 61 Q60 73 69 61 Z" />' +
          '</g>' +
        '</g>' +
      '</g>' +
    '</svg>';

  var busy = false;      // a reaction or walk is running: no idle moves
  var walking = false;   // legs are moving right now

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function between(r) { return r[0] + Math.random() * (r[1] - r[0]); }

  function play(name, ms) {
    if (REDUCED) return Promise.resolve();
    return new Promise(function (res) {
      el.classList.remove(name);
      void el.offsetWidth;          // restart the animation if it was just played
      el.classList.add(name);
      setTimeout(function () { el.classList.remove(name); res(); }, ms);
    });
  }

  // natural blinking, separate from the other moves (keeps going while walking)
  function blinkLoop() {
    play("blink", 180).then(function () {
      if (Math.random() < 0.2) return wait(120).then(function () { return play("blink", 180); });
    });
    setTimeout(blinkLoop, 2800 + Math.random() * 3200);
  }

  var MOVES = [
    ["look-l", 1800], ["look-r", 1800], ["tilt", 1600], ["wave", 1700],
    ["hop", 700], ["sprout", 1400], ["tilt-r", 1600]
  ];
  function idleLoop() {
    if (!busy) {
      var m = MOVES[Math.floor(Math.random() * MOVES.length)];
      play(m[0], m[1]);
    }
    setTimeout(idleLoop, 3500 + Math.random() * 4500);
  }

  // ---------- walking
  // Slide the whole robot (GPU) while the legs step (small SVG moves).
  function stride(from, to, dir) {
    var dist = Math.abs(to - from);
    var speed = Math.max(70, innerWidth / 14);            // px per second
    el.classList.add("walking", dir === "r" ? "go-r" : "go-l");
    walking = true;
    var anim = el.animate(
      [{ transform: "translate3d(" + from + "px,0,0)" }, { transform: "translate3d(" + to + "px,0,0)" }],
      { duration: dist / speed * 1000, easing: "cubic-bezier(.35,0,.65,1)", fill: "forwards" }
    );
    return anim.finished.then(function () {
      el.classList.remove("walking", "go-r", "go-l");
      walking = false;
      return anim;
    });
  }

  function walk() {
    if (REDUCED) return Promise.resolve("off");
    if (busy) return Promise.resolve("busy");   // cheering for a pledge: try again shortly
    busy = true;
    // walk up to the QR panel and stop just before it (never behind it)
    var start = el.getBoundingClientRect();
    var qr = document.getElementById("qrPanel");
    var stopAt = qr ? qr.getBoundingClientRect().left - Math.max(16, innerWidth * 0.015) : innerWidth - start.left;
    var far = Math.max(0, stopAt - start.right);
    if (far < el.offsetWidth * 0.5) { busy = false; return Promise.resolve("no-room"); }   // narrow screen
    var out;
    return stride(0, far, "r")
      .then(function (a) { out = a; return play("look-l", 1800); })
      .then(function () { return play("wave", 1700); })
      .then(function () { return wait(500); })
      .then(function () { return stride(far, 0, "l"); })
      .then(function (back) {
        // settle exactly at home and drop the finished animations
        if (out) out.cancel();
        back.cancel();
        el.style.transform = "";
        busy = false;
        return play("hop", 700);
      })
      .catch(function () { el.classList.remove("walking", "go-r", "go-l"); el.style.transform = ""; walking = false; busy = false; });
  }
  function walkLoop() {
    walk().then(function (res) { setTimeout(walkLoop, res === "busy" ? 3000 : between(WALK_EVERY_MS)); });
  }

  // ---------- big reactions (new pledge)
  function react(kind) {
    if (REDUCED || kind !== "happy") return;
    if (walking) {   // keep walking, just cheer
      play("happy", 2600);
      play("wave", 1700);
      return;
    }
    var wasBusy = busy;
    busy = true;
    el.classList.add("look-r-hold");
    Promise.all([play("happy", 2600), play("wave", 1700), play("hop", 700)]).then(function () {
      el.classList.remove("look-r-hold");
      if (!wasBusy) busy = false;
    });
  }

  // where the robot normally stands (ignores the walk), so leaves keep that spot free
  function homeRect() {
    var parent = el.offsetParent ? el.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
    var left = parent.left + el.offsetLeft, top = parent.top + el.offsetTop;
    return { left: left, top: top, right: left + el.offsetWidth, bottom: top + el.offsetHeight };
  }

  window.WallRobot = { react: react, play: play, walk: walk, homeRect: homeRect, isWalking: function () { return walking; } };
  setTimeout(blinkLoop, 1200);
  setTimeout(idleLoop, 2500);
  if (!REDUCED) setTimeout(walkLoop, between(WALK_FIRST_MS));
})();
