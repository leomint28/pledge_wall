/* =====================================================================
   Admin page logic (staff only)
   - Sign in with Supabase Auth (email + password)
   - Only accounts listed in public.admins get in (checked with is_admin())
   - Live list of pledges, search, delete (takes the leaf off the wall)
   - Pause / resume pledging (settings.pledging_open)
   - Counts and CSV export of zayed_uni_leads
   ===================================================================== */
(function () {
  "use strict";

  var D = window.PLEDGE_DATA;
  var CFG = window.PLEDGE_CONFIG || {};
  var PAGE = 100;
  var COLS = "id,created_at,display_name,preset_id,custom_text,topic,leaf_color,source,lang,translation,translation_lang";
  var $ = function (id) { return document.getElementById(id); };

  $("brandLeaf").innerHTML = D.leafSVG("#4FA33A");

  if (!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase)) {
    notice("This page isn't connected to the database yet. Fill in config.js.");
    return;
  }

  var sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  var channel = null;
  var offset = 0;
  var query = "";
  var started = false;
  var signOutMsg = "";   // shown on the sign-in screen after a forced sign-out

  // ---------- small helpers
  function notice(msg) { $("notice").textContent = msg || ""; $("notice").hidden = !msg; }
  var toastT;
  function toast(msg, bad) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.toggle("bad", !!bad);
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function fmtTime(iso) {
    return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  function topicName(id) { var t = D.topicById(id); return t ? t.en : id; }
  function colorOf(row) { return row.leaf_color || (D.topicById(row.topic) || {}).color || "#4FA33A"; }

  // ---------- sign in / out
  function showLogin(msg) {
    $("login").hidden = false;
    $("dash").hidden = true;
    $("who").hidden = true;
    $("loginError").textContent = msg || "";
    stopLive();
  }

  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var email = $("email").value.trim(), pw = $("password").value;
    if (!email || !pw) { $("loginError").textContent = "Enter your email and password."; return; }
    $("loginBtn").disabled = true;
    $("loginBtn").textContent = "Signing in…";
    sb.auth.signInWithPassword({ email: email, password: pw }).then(function (r) {
      $("loginBtn").disabled = false;
      $("loginBtn").textContent = "Sign in";
      if (r.error) {
        $("loginError").textContent = /invalid/i.test(r.error.message)
          ? "Email or password is wrong. Check them and try again."
          : "Couldn't sign in: " + r.error.message;
        return;
      }
      $("password").value = "";
      enter(r.data.session);
    });
  });

  $("signOut").addEventListener("click", function () {
    sb.auth.signOut().then(function () { started = false; showLogin(); });
  });

  // signed in: check the account is staff, then open the dashboard
  function enter(session) {
    if (!session) return showLogin();
    sb.rpc("is_admin").then(function (r) {
      if (r.error) return showLogin("Couldn't check your account. Try again.");
      if (r.data !== true) {
        // keep this message on screen when the sign-out event fires
        signOutMsg = "This account isn't a staff account. Ask the event lead to add you as an admin.";
        showLogin(signOutMsg);
        return sb.auth.signOut();
      }
      $("whoEmail").textContent = session.user && session.user.email || "";
      $("who").hidden = false;
      $("login").hidden = true;
      $("dash").hidden = false;
      if (!started) { started = true; startDash(); }
    });
  }

  // ---------- dashboard
  function startDash() {
    loadSettings();
    loadStats();
    loadPage(true);
    startLive();
  }

  // pause switch
  function renderPause(open) {
    $("pauseSwitch").setAttribute("aria-checked", String(open));
    $("pauseTitle").textContent = open ? "Pledging is open" : "Pledging is paused";
    $("pauseHelp").textContent = open
      ? "Students can add pledges from phones and the booth tablet."
      : "New pledges are blocked on phones and the tablet. The wall keeps showing existing leaves.";
    document.querySelector(".control").classList.toggle("paused", !open);
  }
  function loadSettings() {
    return sb.from("settings").select("pledging_open").eq("id", 1).single().then(function (r) {
      if (!r.error && r.data) renderPause(r.data.pledging_open);
    });
  }
  $("pauseSwitch").addEventListener("click", function () {
    var next = $("pauseSwitch").getAttribute("aria-checked") !== "true";
    $("pauseSwitch").disabled = true;
    sb.from("settings").update({ pledging_open: next, updated_at: new Date().toISOString() }).eq("id", 1).select()
      .then(function (r) {
        $("pauseSwitch").disabled = false;
        if (r.error || !r.data || !r.data.length) return toast("Couldn't change the setting. Try again.", true);
        renderPause(next);
        toast(next ? "Pledging resumed." : "Pledging paused.");
      });
  });

  // counts
  function count(table, col, val) {
    var q = sb.from(table).select("id", { count: "exact", head: true });
    if (col) q = q.eq(col, val);
    return q.then(function (r) { return r.count == null ? "–" : r.count.toLocaleString("en"); });
  }
  var statsT;
  function loadStats() {
    clearTimeout(statsT);
    statsT = setTimeout(function () {
      Promise.all([count("pledges"), count("pledges", "source", "qr"), count("pledges", "source", "kiosk"), count("zayed_uni_leads")])
        .then(function (v) { $("sTotal").textContent = v[0]; $("sQr").textContent = v[1]; $("sKiosk").textContent = v[2]; $("sLeads").textContent = v[3]; });
    }, 300);
  }

  // list
  function rowEl(row, isNew) {
    var li = document.createElement("li");
    li.className = "row" + (isNew ? " new" : "");
    li.dataset.id = row.id;
    li._row = row;   // kept so live updates can be merged into it
    li.innerHTML = D.leafSVG(colorOf(row)) +
      '<div><p class="row-name"></p><p class="row-text" dir="auto"></p><p class="row-trans" dir="auto" hidden></p><p class="row-meta"><span></span><span></span><span></span></p></div>' +
      '<button type="button" class="del">Delete</button>';
    li.querySelector(".row-name").textContent = row.display_name;
    li.querySelector(".row-text").textContent = D.pledgeText(row);
    setRowTranslation(li, row);
    var meta = li.querySelectorAll(".row-meta span");
    meta[0].textContent = topicName(row.topic);
    meta[1].textContent = row.source === "kiosk" ? "Tablet" : "Phone";
    meta[2].textContent = fmtTime(row.created_at);
    var btn = li.querySelector(".del");
    btn.setAttribute("aria-label", "Delete pledge by " + row.display_name);
    btn.addEventListener("click", function () { askDelete(row, li, btn); });
    return li;
  }

  function setRowTranslation(li, row) {
    var tr = D.pledgeTranslation(row), el = li.querySelector(".row-trans");
    el.textContent = tr ? tr.text : "";
    el.hidden = !tr;
  }

  // search: name, custom text, or the text of a preset
  function applySearch(q) {
    var clean = q.replace(/[,()*%"'\\]/g, " ").trim();
    if (!clean) return null;
    var low = clean.toLowerCase();
    var presetIds = D.PRESETS.filter(function (p) {
      return p.en.toLowerCase().indexOf(low) !== -1 || p.ar.indexOf(clean) !== -1;
    }).map(function (p) { return p.id; });
    var parts = ["display_name.ilike.*" + clean + "*", "custom_text.ilike.*" + clean + "*"];
    if (presetIds.length) parts.push("preset_id.in.(" + presetIds.join(",") + ")");
    return parts.join(",");
  }

  var loadSeq = 0;
  function loadPage(reset) {
    var seq = ++loadSeq;
    if (reset) { offset = 0; $("list").innerHTML = ""; }
    $("moreBtn").disabled = true;
    var q = sb.from("pledges").select(COLS).order("created_at", { ascending: false }).range(offset, offset + PAGE - 1);
    var f = applySearch(query);
    if (f) q = q.or(f);
    return q.then(function (r) {
      if (seq !== loadSeq) return;   // a newer search replaced this one
      $("moreBtn").disabled = false;
      if (r.error) return toast("Couldn't load pledges. Check the connection.", true);
      var rows = r.data || [];
      rows.forEach(function (row) { if (!document.querySelector('.row[data-id="' + row.id + '"]')) $("list").appendChild(rowEl(row)); });
      offset += rows.length;
      $("moreBtn").hidden = rows.length < PAGE;
      $("listTitle").textContent = query ? "Search results" : "Latest pledges";
      var none = !$("list").children.length;
      $("empty").hidden = !none;
      $("empty").textContent = query ? "No pledges match \u201C" + query + "\u201D." : "No pledges yet. They'll appear here as students add them.";
    });
  }
  $("moreBtn").addEventListener("click", function () { loadPage(false); });

  var searchT;
  $("search").addEventListener("input", function () {
    clearTimeout(searchT);
    searchT = setTimeout(function () { query = $("search").value.trim(); loadPage(true); }, 300);
  });

  // delete: tap once to arm, tap again within 4 s to delete
  function askDelete(row, li, btn) {
    if (!btn.classList.contains("confirm")) {
      btn.classList.add("confirm");
      btn.textContent = "Tap again to delete";
      btn._t = setTimeout(function () { btn.classList.remove("confirm"); btn.textContent = "Delete"; }, 4000);
      return;
    }
    clearTimeout(btn._t);
    btn.disabled = true;
    btn.textContent = "Deleting…";
    sb.from("pledges").delete().eq("id", row.id).select("id").then(function (r) {
      if (r.error || !r.data || !r.data.length) {
        btn.disabled = false;
        btn.classList.remove("confirm");
        btn.textContent = "Delete";
        return toast("Couldn't delete it. It may already be gone, or this account can't delete.", true);
      }
      removeRow(row.id);
      toast("Deleted. It's gone from the wall.");
      loadStats();
    });
  }
  function removeRow(id) {
    var li = document.querySelector('.row[data-id="' + id + '"]');
    if (!li) return;
    li.classList.add("gone");
    setTimeout(function () {
      li.remove();
      offset = Math.max(0, offset - 1);
      if (!$("list").children.length) $("empty").hidden = false;
    }, 300);
  }

  // ---------- live updates (new pledges, deletes by other staff)
  function startLive() {
    stopLive();
    channel = sb.channel("pledge-admin")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pledges" }, function (p) {
        loadStats();
        if (query || document.querySelector('.row[data-id="' + p.new.id + '"]')) return;
        $("list").insertBefore(rowEl(p.new, true), $("list").firstChild);
        offset += 1;
        $("empty").hidden = true;
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "pledges" }, function (p) {
        loadStats();
        if (p.old && p.old.id) removeRow(p.old.id);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pledges" }, function (p) {
        var li = p.new && document.querySelector('.row[data-id="' + p.new.id + '"]');
        if (li) setRowTranslation(li, Object.assign(li._row || {}, p.new));   // a translation arrived
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "settings" }, function (p) {
        if (p.new && typeof p.new.pledging_open === "boolean") renderPause(p.new.pledging_open);
      })
      .subscribe(function (st) {
        if (st === "SUBSCRIBED") { notice(""); loadSettings(); }
        else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") notice("Live updates paused. Reconnecting…");
      });
  }
  function stopLive() { if (channel) { sb.removeChannel(channel); channel = null; } }

  // ---------- CSV export of leads
  function csvCell(v) {
    var s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s) && !/^\+?[0-9 ()-]+$/.test(s)) s = "'" + s;   // stop spreadsheet formulas (phone numbers are kept as they are)
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function fetchAllLeads() {
    var all = [], step = 1000;
    function page(from) {
      return sb.from("zayed_uni_leads")
        .select("created_at,full_name,phone,email,interest_topic,source,lang,consent_text,consent_at,pledge_id,pledges(preset_id,custom_text,lang,translation,translation_lang)")
        .order("created_at", { ascending: true }).range(from, from + step - 1)
        .then(function (r) {
          if (r.error) throw r.error;
          all = all.concat(r.data || []);
          return (r.data || []).length === step ? page(from + step) : all;
        });
    }
    return page(0);
  }
  $("exportBtn").addEventListener("click", function () {
    var btn = $("exportBtn");
    btn.disabled = true;
    btn.textContent = "Preparing…";
    fetchAllLeads().then(function (rows) {
      var head = ["Date", "Full name", "Phone", "Email", "Interested in", "Pledge", "Pledge translation", "Pledge status", "Source", "Language", "Consent text", "Consent time"];
      var lines = [head.join(",")];
      rows.forEach(function (r) {
        var p = r.pledges;
        lines.push([
          new Date(r.created_at).toLocaleString("en-GB"), r.full_name, r.phone, r.email, topicName(r.interest_topic),
          p ? D.pledgeText(p) : "", p && D.pledgeTranslation(p) ? D.pledgeTranslation(p).text : "", p ? "On the wall" : "Deleted from the wall",
          r.source === "kiosk" ? "Tablet" : "Phone", r.lang === "ar" ? "Arabic" : "English",
          r.consent_text, new Date(r.consent_at).toLocaleString("en-GB")
        ].map(csvCell).join(","));
      });
      // BOM so Excel shows Arabic correctly
      var blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "zayed-uni-leads-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast("Exported " + rows.length + " lead" + (rows.length === 1 ? "" : "s") + ".");
    }).catch(function () {
      toast("Couldn't export the leads. Try again.", true);
    }).then(function () {
      btn.disabled = false;
      btn.textContent = "Export leads (CSV)";
    });
  });

  // ---------- start: reuse a saved session if there is one
  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (s) enter(s); else showLogin();
  });
  sb.auth.onAuthStateChange(function (ev) {
    if (ev === "SIGNED_OUT") { started = false; showLogin(signOutMsg); signOutMsg = ""; }
  });
})();
