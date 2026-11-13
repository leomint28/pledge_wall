/* =====================================================================
   Little robot in the bottom-left corner of the wall.
   Idle: blinks, glances, tilts its head, waves, hops, wiggles its sprout.
   window.WallRobot.react("happy") when a new pledge arrives.
   Each move is a CSS class on #robot; only transforms animate.
   ===================================================================== */
(function () {
  "use strict";

  var el = document.getElementById("robot");
  if (!el) return;
  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Drawn in a 120 x 160 box. Parts that move are in their own groups.
  el.innerHTML =
    '<svg viewBox="0 0 120 160" aria-hidden="true">' +
      '<ellipse class="r-shadow" cx="60" cy="154" rx="30" ry="4.5"/>' +
      '<g class="r-all">' +
        // legs and feet
        '<rect x="44" y="128" width="10" height="20" rx="5" class="r-dark"/>' +
        '<rect x="66" y="128" width="10" height="20" rx="5" class="r-dark"/>' +
        '<rect x="38" y="144" width="20" height="9" rx="4.5" class="r-dark"/>' +
        '<rect x="62" y="144" width="20" height="9" rx="4.5" class="r-dark"/>' +
        // arms (left one rests, right one waves) – pivot at the shoulder
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
    '</svg>' +
    // a tuft of grass in front of the feet, in its own layer so its sway never redraws the robot
    '<div class="r-tuft"><svg viewBox="0 130 120 32" preserveAspectRatio="none">' + tuft() + '</svg></div>';

  function tuft() {
    var out = "", colors = ["#4C8A43", "#5A9A4E", "#6FAA5D"];
    for (var x = 14; x < 106; x += 4 + Math.random() * 4) {
      var h = 10 + Math.random() * 12, w = 4 + Math.random() * 3, lean = (Math.random() - .5) * 8;
      out += '<path fill="' + colors[Math.floor(Math.random() * 3)] + '" d="M' + x.toFixed(1) + ' 162 Q' +
        (x + lean * .4).toFixed(1) + " " + (162 - h * .55).toFixed(1) + " " + (x + w / 2 + lean).toFixed(1) + " " + (162 - h).toFixed(1) +
        " Q" + (x + w + lean * .3).toFixed(1) + " " + (162 - h * .5).toFixed(1) + " " + (x + w).toFixed(1) + ' 162Z"/>';
    }
    return out;
  }

  var busy = false;
  function play(name, ms) {
    if (REDUCED) return Promise.resolve();
    return new Promise(function (res) {
      el.classList.remove(name);
      void el.offsetWidth;          // restart the animation if it was just played
      el.classList.add(name);
      setTimeout(function () { el.classList.remove(name); res(); }, ms);
    });
  }

  // natural blinking, separate from the other moves
  function blinkLoop() {
    play("blink", 180).then(function () {
      if (Math.random() < 0.2) return new Promise(function (r) { setTimeout(r, 120); }).then(function () { return play("blink", 180); });
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

  // big reactions (new pledge)
  function react(kind) {
    if (REDUCED) return;
    busy = true;
    if (kind === "happy") {
      el.classList.add("look-r-hold");
      Promise.all([play("happy", 2600), play("wave", 1700), play("hop", 700)]).then(function () {
        el.classList.remove("look-r-hold");
        busy = false;
      });
    } else {
      busy = false;
    }
  }

  window.WallRobot = { react: react, play: play };
  setTimeout(blinkLoop, 1200);
  setTimeout(idleLoop, 2500);
})();
