/* =====================================================================
   Pledge page logic
   - Phone (QR):      /pledge                -> source "qr"
   - Booth tablet:    /pledge?mode=kiosk     -> source "kiosk",
                      offline queue + "Next person" reset
   Talks to Supabase with plain fetch (no library needed):
     POST /rest/v1/rpc/submit_pledge
     GET  /rest/v1/settings?id=eq.1   (pause switch)
   Custom pledges: topic "custom", leaf colour chosen from swatches.
   ===================================================================== */
(function () {
  "use strict";

  var D = window.PLEDGE_DATA;
  var CFG = window.PLEDGE_CONFIG || {};
  var KIOSK = new URLSearchParams(location.search).get("mode") === "kiosk";
  var SOURCE = KIOSK ? "kiosk" : "qr";
  var QUEUE_KEY = "zuPledgeQueue";
  var LAST_KEY = "zuLastPledgeAt";
  var LANG_KEY = "zuLang";
  var RESET_AFTER_MS = 20000;   // booth: back to start after the done screen
  var WAIT_MS = 30000;          // phone: one pledge per 30 s per device

  var $ = function (id) { return document.getElementById(id); };

  // ---------- storage helpers (never let storage errors break the page)
  function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16);
    });
  }

  // ---------- state
  var lang = load(LANG_KEY, null) || ((navigator.language || "").toLowerCase().indexOf("ar") === 0 ? "ar" : "en");
  function freshState() {
    return { presetId: null, custom: false, customColor: null, clientRef: null };
  }
  var state = freshState();
  var configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  var paused = false;
  var resetTimer = null;

  function t(key) { return D.UI[lang][key] || D.UI.en[key] || ""; }

  // ---------- rendering
  function applyLanguage() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-t]").forEach(function (el) { el.textContent = t(el.getAttribute("data-t")); });
    document.querySelectorAll("[data-ph]").forEach(function (el) { el.placeholder = t(el.getAttribute("data-ph")); });
    document.querySelectorAll(".lang-switch button").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang));
    });
    $("consent").textContent = D.CONSENT[lang];
    document.title = t("brand");
    renderPresets();
    renderSwatches();
    updateCustom();
    renderChosen();
    renderNotice();
  }

  function radioButton(cls, checked) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(!!checked));
    return b;
  }

  // The 4 form presets in one list (each with its own leaf colour), then "write my own".
  function renderPresets() {
    var box = $("presets");
    box.innerHTML = "";
    var list = document.createElement("div");
    list.className = "options";
    D.PRESETS.filter(function (p) { return p.form; }).forEach(function (p) {
      var color = D.topicById(p.topic).color;
      var b = radioButton("option", !state.custom && state.presetId === p.id);
      b.innerHTML = D.leafSVG(color) + '<span class="text"></span><span class="radio" aria-hidden="true"></span>';
      b.querySelector(".text").textContent = p[lang];
      b.addEventListener("click", function () { pickPreset(p.id); });
      list.appendChild(b);
    });
    var group = document.createElement("div");
    group.className = "group";
    group.appendChild(list);
    box.appendChild(group);

    var own = document.createElement("div");
    own.className = "group";
    own.innerHTML = '<p class="group-title"><span></span></p><div class="options"></div>';
    own.querySelector("span").textContent = t("ownGroup");
    var ob = radioButton("option", state.custom);
    ob.id = "writeOwn";
    ob.innerHTML = '<span class="own-icon" aria-hidden="true">+</span><span class="text"></span><span class="radio" aria-hidden="true"></span>';
    ob.querySelector(".text").textContent = t("writeOwn");
    ob.addEventListener("click", pickCustom);
    own.querySelector(".options").appendChild(ob);
    box.appendChild(own);
    $("customBox").hidden = !state.custom;
  }

  function pickPreset(id) {
    state.presetId = id; state.custom = false;
    clearError("pickError");
    renderPresets();
  }
  function pickCustom() {
    state.custom = true; state.presetId = null;
    clearError("pickError");
    renderPresets();   // the custom box sits right after the list, below "write my own"
    $("customText").focus();
  }

  function renderSwatches() {
    var box = $("swatches");
    box.innerHTML = "";
    D.SWATCHES.forEach(function (s) {
      var b = radioButton("swatch", state.customColor === s.color);
      b.setAttribute("aria-label", s[lang]);
      b.title = s[lang];
      b.innerHTML = D.leafSVG(s.color);
      b.addEventListener("click", function () {
        state.customColor = s.color;
        clearError("pickError");
        renderSwatches();
        updateCustom();
      });
      box.appendChild(b);
    });
  }

  // Counter + live leaf preview for a custom pledge.
  function updateCustom() {
    var txt = $("customText").value;
    // ⁦…⁩ keeps "27 / 90" in this order inside Arabic text
    $("customCount").textContent = "⁦" + txt.length + " / " + D.CUSTOM_MAX + "⁩";
    $("previewLeaf").innerHTML = D.leafSVG(state.customColor || "#C5D6C9");
    $("previewText").textContent = txt.trim();
  }

  function chosenPledge() {
    if (state.custom) {
      return { text: $("customText").value.trim().replace(/\s+/g, " "), topic: "custom", color: state.customColor };
    }
    var p = D.presetById(state.presetId);
    if (!p) return null;
    return { text: p[lang], topic: p.topic, color: D.topicById(p.topic).color };
  }

  function renderChosen() {
    var c = chosenPledge();
    if (!c || !c.color) return;
    $("chosenLeaf").innerHTML = D.leafSVG(c.color);
    $("chosenText").textContent = c.text;
  }

  function renderNotice() {
    var msg = !configured ? t("notConfigured") : (paused ? t("paused") : "");
    $("notice").textContent = msg;
    $("notice").hidden = !msg;
    $("toDetails").disabled = !configured || paused;
    $("submitBtn").disabled = !configured || paused;
  }

  function show(stepId) {
    ["stepPick", "stepDetails", "stepDone"].forEach(function (id) { $(id).hidden = id !== stepId; });
    var n = stepId === "stepPick" ? 1 : 2;
    $("stepper").hidden = stepId === "stepDone";
    document.querySelectorAll("#stepper li").forEach(function (li) {
      var s = +li.getAttribute("data-step");
      li.classList.toggle("is-current", s === n);
      li.classList.toggle("is-done", s < n);
      if (s === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
    var h = $(stepId).querySelector("h1");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }

  // ---------- errors
  function setError(id, msg, inputId) {
    $(id).textContent = msg;
    if (inputId) $(inputId).setAttribute("aria-invalid", "true");
  }
  function clearError(id, inputId) {
    $(id).textContent = "";
    if (inputId) $(inputId).removeAttribute("aria-invalid");
  }

  // ---------- step 1 -> 2
  function goToDetails() {
    clearError("pickError");
    if (!state.custom && !state.presetId) return setError("pickError", t("errPick"));
    if (state.custom) {
      var txt = $("customText").value.trim();
      if (!txt || txt.length > D.CUSTOM_MAX) { setError("pickError", t("errCustom"), "customText"); return $("customText").focus(); }
      $("customText").removeAttribute("aria-invalid");
      if (!state.customColor) return setError("pickError", t("errColour"));
    }
    if (!state.clientRef) state.clientRef = uuid();
    renderChosen();
    show("stepDetails");
  }

  // ---------- validation of step 2
  function validate() {
    var ok = true, first = null;
    var name = $("fName").value.trim().replace(/\s+/g, " ");
    var phone = $("fPhone").value.trim();
    var email = $("fEmail").value.trim();
    ["eName", "ePhone", "eEmail"].forEach(function (e) { clearError(e); });
    ["fName", "fPhone", "fEmail"].forEach(function (f) { $(f).removeAttribute("aria-invalid"); });

    if (name.length < D.RULES.nameMin || name.length > D.RULES.nameMax) { setError("eName", t("errName"), "fName"); ok = false; first = first || "fName"; }
    var digits = phone.replace(/\D/g, "").length;
    if (!D.RULES.phone.test(phone) || digits < 7 || digits > 15) { setError("ePhone", t("errPhone"), "fPhone"); ok = false; first = first || "fPhone"; }
    if (!D.RULES.email.test(email) || email.length > D.RULES.emailMax) { setError("eEmail", t("errEmail"), "fEmail"); ok = false; first = first || "fEmail"; }
    if (first) $(first).focus();
    return ok ? { name: name, phone: phone, email: email } : null;
  }

  function buildPayload(f) {
    var c = chosenPledge();
    return {
      p_client_ref: state.clientRef,
      p_full_name: f.name,
      p_phone: f.phone,
      p_email: f.email,
      p_interest_topic: null,   // no longer asked
      p_preset_id: state.custom ? null : state.presetId,
      p_custom_text: state.custom ? c.text : null,
      p_topic: c.topic,
      p_leaf_color: c.color,
      p_source: SOURCE,
      p_lang: lang,
      p_consent_text: D.CONSENT[lang],
      p_website: $("fWebsite").value
    };
  }

  // ---------- talking to Supabase
  function apiBase() { return CFG.SUPABASE_URL.replace(/\/$/, ""); }
  function headers() {
    return {
      "apikey": CFG.SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + CFG.SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    };
  }

  // Resolves {ok:true,id} | {ok:false,kind:"paused"|"rejected"|"network"}
  function sendPledge(payload) {
    return fetch(apiBase() + "/rest/v1/rpc/submit_pledge", {
      method: "POST", headers: headers(), body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (res.ok) return { ok: true, id: body };
        if (body && body.message === "PLEDGING_PAUSED") return { ok: false, kind: "paused" };
        if (res.status >= 500) return { ok: false, kind: "network" };
        return { ok: false, kind: "rejected" };
      });
    }, function () { return { ok: false, kind: "network" }; });
  }

  // custom pledges: ask the translate-pledge function to add a translation (fire and forget)
  function requestTranslation(id, payload) {
    if (!payload.p_custom_text || typeof id !== "string") return;
    fetch(apiBase() + "/functions/v1/translate-pledge", {
      method: "POST", headers: { "apikey": CFG.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ id: id }), keepalive: true
    }).catch(function () { /* the pledge is saved either way */ });
  }

  function checkPaused() {
    if (!configured) return Promise.resolve();
    return fetch(apiBase() + "/rest/v1/settings?select=pledging_open&id=eq.1", { headers: headers() })
      .then(function (r) { return r.json(); })
      .then(function (rows) { paused = !!(rows && rows[0] && rows[0].pledging_open === false); renderNotice(); })
      .catch(function () { /* offline: keep last known state */ });
  }

  // ---------- booth offline queue
  var syncing = false;
  function syncPending() {
    if (!KIOSK || !configured || syncing) return;
    var queue = load(QUEUE_KEY, []);
    if (!queue.length) return;
    syncing = true;
    var item = queue[0];
    sendPledge(item).then(function (r) {
      // sent, or refused for good (bad data) -> remove; network/paused -> keep for later
      if (r.ok) requestTranslation(r.id, item);
      if (r.ok || r.kind === "rejected") {
        store(QUEUE_KEY, load(QUEUE_KEY, []).filter(function (x) { return x.p_client_ref !== item.p_client_ref; }));
        syncing = false;
        syncPending();
      } else {
        syncing = false;
      }
    });
  }

  // ---------- submit
  function onSubmit(ev) {
    ev.preventDefault();
    clearError("submitError");
    if (!configured || paused) return;
    var f = validate();
    if (!f) return;

    if (!KIOSK && Date.now() - load(LAST_KEY, 0) < WAIT_MS) return setError("submitError", t("errWait"));

    var payload = buildPayload(f);
    var btn = $("submitBtn");
    btn.disabled = true;
    btn.textContent = t("sending");

    sendPledge(payload).then(function (r) {
      btn.disabled = false;
      btn.textContent = t("submit");
      if (r.ok) {
        requestTranslation(r.id, payload);
        if (!KIOSK) store(LAST_KEY, Date.now());
        return showDone(false, f.name);
      }
      if (r.kind === "paused") { paused = true; renderNotice(); return setError("submitError", t("paused")); }
      if (r.kind === "rejected") return setError("submitError", t("errServer"));
      // network problem
      if (KIOSK) {
        var q = load(QUEUE_KEY, []);
        if (!q.some(function (x) { return x.p_client_ref === payload.p_client_ref; })) q.push(payload);
        store(QUEUE_KEY, q);
        return showDone(true, f.name);
      }
      setError("submitError", t("errNetwork"));
    });
  }

  function showDone(queued, fullName) {
    var c = chosenPledge();
    $("doneLeaf").innerHTML = D.leafSVG(c.color);
    $("doneName").textContent = fullName.split(" ")[0];
    $("doneText").textContent = c.text;
    $("doneBody").textContent = queued ? t("doneQueued") : t("doneBody");
    $("nextBtn").hidden = !KIOSK;
    show("stepDone");
    if (KIOSK) {
      clearTimeout(resetTimer);
      resetTimer = setTimeout(resetForNext, RESET_AFTER_MS);
    }
  }

  function resetForNext() {
    clearTimeout(resetTimer);
    state = freshState();
    $("detailsForm").reset();
    $("customText").value = "";
    ["pickError", "submitError", "eName", "ePhone", "eEmail"].forEach(function (e) { clearError(e); });
    applyLanguage();
    show("stepPick");
  }

  // ---------- wiring
  $("brandLeaf").innerHTML = D.leafSVG("#4FA33A");
  document.querySelectorAll(".lang-switch button").forEach(function (b) {
    b.addEventListener("click", function () {
      lang = b.getAttribute("data-lang");
      store(LANG_KEY, lang);
      applyLanguage();
    });
  });
  $("customText").addEventListener("input", function () { updateCustom(); clearError("pickError", "customText"); });
  $("toDetails").addEventListener("click", goToDetails);
  $("backToPick").addEventListener("click", function () { show("stepPick"); });
  $("detailsForm").addEventListener("submit", onSubmit);
  $("nextBtn").addEventListener("click", resetForNext);
  // clear a field's error as soon as the person edits it
  [["fName", "eName"], ["fPhone", "ePhone"], ["fEmail", "eEmail"]].forEach(function (p) {
    $(p[0]).addEventListener("input", function () { clearError(p[1], p[0]); });
  });

  if (KIOSK) {
    document.body.classList.add("kiosk");
    window.addEventListener("online", syncPending);
    setInterval(function () { syncPending(); checkPaused(); }, 60000);
  }

  applyLanguage();
  show("stepPick");
  checkPaused().then(syncPending);
})();
