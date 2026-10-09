/*!
 * HighPre consent widget
 * Install (one line, everything else is switched on in the dashboard):
 *   <script src="https://highpre.com/s/SITE_KEY.js"></script>
 * Older installs keep working:
 *   <script src="https://highpre.com/widget.js" data-hp-site="SITE_KEY" async></script>
 *
 * - Draws the privacy centre badge when it's switched on (inside [data-hp-badge]
 *   if the site has such an element, else at the end of the page or in a corner).
 * - Shows a consent banner for the site's published notice and purposes.
 * - Speaks every language the site publishes, starting with the visitor's own.
 * - Activates <script type="text/plain" data-hp-purpose="key"> only after consent.
 * - Records every decision in the HighPre consent ledger.
 * - Offers a persistent button to change or withdraw consent.
 * - Optional age check: under-18s get essential purposes only until a parent
 *   or guardian consents on a verified page; tracking stays off for them.
 * - Identifies visitors only by a random ID stored in localStorage. No cookies,
 *   no fingerprinting.
 * - Optional Google Consent Mode v2 and Meta Pixel consent signals. Load this
 *   script without `async`, before the Google tag, GTM or the Pixel, so the
 *   "denied" defaults are in place before they run (data-hp-consent-mode turns
 *   Google signals on even on a visitor's first page view).
 * - Layouts: bar (full width), popup (centred, focus trapped) or box (corner),
 *   in the site's own colours and font if chosen. No web fonts are loaded.
 * - Escape never counts as consent: it steps back or hides the banner with
 *   nothing granted, and the banner returns on the next page.
 *
 * Public API: window.HighPre.open(), .getConsent(), .onChange(fn), .setLanguage(code)
 * Event: window "highpre:consent" with detail { decisions, version }
 */
import { initForms } from "./forms.js";
import { buildGoogleConsent, metaConsent } from "../../src/lib/consent-mode";
import { isHex, readableOn, withAlpha } from "../../src/lib/color";
import { SYSTEM_FONT_STACK } from "../../src/lib/banner-layout";

(function () {
  "use strict";

  // Set by the per-site script /s/<siteKey>.js: the site key and its consent-signal settings.
  var preset = window.__HP_BOOT || null;
  var script =
    document.currentScript ||
    document.querySelector("script[data-hp-site]") ||
    (preset && preset.siteKey && document.querySelector('script[src*="/s/' + preset.siteKey + '.js"]')) ||
    document.querySelector('script[src*="widget.js"][data-site]');
  if (!script || window.HighPre) return;

  var siteKey = script.getAttribute("data-hp-site") || script.getAttribute("data-site") || (preset && preset.siteKey);
  if (!siteKey) return console.warn("[HighPre] Missing site key: copy the script line from your HighPre dashboard.");

  var API = new URL(script.src).origin;
  var STORE_KEY = "hp_consent_" + siteKey;
  var listeners = [];
  var config = null;
  // { principalId, version, decisions: { key: bool }, at, lang, age: "adult"|"child", parental: bool }
  var state = null;
  var lang = "en";
  var host, root;
  var currentView = "summary";
  var lastFocus = null;

  // ── Storage ────────────────────────────────────────────────────────
  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch (e) {
      return null;
    }
  }
  function save(s) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
    } catch (e) {
      /* storage blocked: consent still applies for this page view */
    }
  }
  function randomId() {
    var bytes = new Uint8Array(18);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    var out = "";
    for (var i = 0; i < bytes.length; i++) out += chars[bytes[i] % 64];
    return out + Date.now().toString(36);
  }
  function principalId() {
    return (state && state.principalId) || randomId();
  }

  // ── Google Consent Mode and Meta Pixel ─────────────────────────────
  // Runs as soon as the script executes: tags placed after it see the defaults
  // (and a returning visitor's choices) before they fire. The site's settings
  // come from the last config response, cached in localStorage.
  var CM_KEY = "hp_cm_" + siteKey;
  // { google, meta, adsDataRedaction, urlPassthrough, types: { purposeKey: [type] }, essential: [purposeKey] }
  var cm = loadKey(CM_KEY);
  // The per-site script carries the current settings: they win over the cache, even on a first visit.
  if (preset && "cm" in preset) cm = preset.cm;
  if (script.hasAttribute("data-hp-consent-mode")) cm = Object.assign({ adsDataRedaction: true, types: {} }, cm, { google: true });
  var gcmDefaulted = false;
  var fbWanted = null;
  var fbWatching = false;

  function loadKey(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch (e) {
      return null;
    }
  }

  /** Calls the page's gtag, or queues on dataLayer exactly as gtag.js expects. Never replaces an existing gtag. */
  function gtag() {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== "function") {
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
    }
    window.gtag.apply(window, arguments);
  }

  /** The visitor's decisions for the current notice, or null when they haven't chosen (or the notice changed). */
  function liveDecisions() {
    if (!state || !state.version || !state.decisions) return null;
    if (config && state.version !== config.version) return null;
    return state.decisions;
  }

  /** Decisions with nothing optional granted: essential purposes only. */
  function essentialDecisions() {
    var d = {};
    ((cm && cm.essential) || []).forEach(function (k) {
      d[k] = true;
    });
    return d;
  }

  function fbConsent(value) {
    fbWanted = value;
    if (typeof window.fbq === "function") {
      try {
        window.fbq("consent", value);
      } catch (e) {
        /* a broken pixel must not break the banner */
      }
    } else watchFbq();
  }

  /**
   * The Pixel isn't on the page yet. Its base code assigns window.fbq and then
   * fbq.queue; catch that moment and queue our consent call first, so it lands
   * before the site's fbq('init') without defining fbq ourselves (which would
   * stop the base code from loading the Pixel at all).
   */
  function watchFbq() {
    if (fbWatching) return;
    fbWatching = true;
    try {
      Object.defineProperty(window, "fbq", {
        configurable: true,
        get: function () {
          return undefined;
        },
        set: function (fn) {
          Object.defineProperty(window, "fbq", { value: fn, writable: true, configurable: true, enumerable: true });
          if (typeof fn !== "function") return;
          if (fn.queue || fn.callMethod) return fbConsent(fbWanted);
          var q;
          // Not Meta's stub after all (no queue is ever assigned): apply once the assigning script finishes.
          setTimeout(function () {
            if (q === undefined && window.fbq === fn) fbConsent(fbWanted);
          }, 0);
          Object.defineProperty(fn, "queue", {
            configurable: true,
            get: function () {
              return q;
            },
            set: function (arr) {
              q = arr;
              Object.defineProperty(fn, "queue", { value: arr, writable: true, configurable: true, enumerable: true });
              fbConsent(fbWanted);
            },
          });
        },
      });
    } catch (e) {
      /* window.fbq not configurable: the next decision applies it if fbq exists by then */
    }
  }

  /** Sends Consent Mode / Meta signals for the current state. The first call also sets the defaults. */
  function signal(initial) {
    if (!cm || (!cm.google && !cm.meta)) return;
    var live = liveDecisions();
    var g = buildGoogleConsent(cm.types || {}, live || essentialDecisions());
    if (cm.google) {
      if (!gcmDefaulted) {
        gcmDefaulted = true;
        var defaults = buildGoogleConsent(cm.types || {}, essentialDecisions());
        defaults.wait_for_update = 500;
        gtag("consent", "default", defaults);
        if (cm.adsDataRedaction) gtag("set", "ads_data_redaction", true);
        if (cm.urlPassthrough) gtag("set", "url_passthrough", true);
      }
      if (!initial || live) gtag("consent", "update", g);
    }
    if (cm.meta) fbConsent(metaConsent(g));
  }

  /** Applies the site's latest settings and caches them for the next page's synchronous start. */
  function syncConsentMode() {
    var c = config.consentMode;
    var forced = script.hasAttribute("data-hp-consent-mode");
    if (!c || (!c.google && !c.meta && !forced)) {
      try {
        localStorage.removeItem(CM_KEY);
      } catch (e) {
        /* storage blocked */
      }
      // Defaults already sent from an older cache stay; nothing more is sent.
      if (!gcmDefaulted) cm = null;
      return;
    }
    cm = {
      google: !!c.google || forced,
      meta: !!c.meta,
      adsDataRedaction: c.adsDataRedaction !== false,
      urlPassthrough: !!c.urlPassthrough,
      types: c.types || {},
      essential: config.purposes
        .filter(function (p) {
          return p.essential;
        })
        .map(function (p) {
          return p.key;
        }),
    };
    try {
      localStorage.setItem(CM_KEY, JSON.stringify(cm));
    } catch (e) {
      /* storage blocked: defaults are set from this response instead */
    }
    // Late defaults if the cache was empty (first visit without data-hp-consent-mode), then the live state.
    signal();
  }

  state = load();
  signal(true);

  // ── Language ───────────────────────────────────────────────────────
  function codes() {
    return config.languages.map(function (l) {
      return l.code;
    });
  }
  function pickLanguage() {
    var available = codes();
    if (state && state.lang && available.indexOf(state.lang) >= 0) return state.lang;
    var wanted = (navigator.languages || [navigator.language || ""]).map(function (l) {
      return String(l).slice(0, 2).toLowerCase();
    });
    for (var i = 0; i < wanted.length; i++) if (available.indexOf(wanted[i]) >= 0) return wanted[i];
    return available.indexOf(config.banner.defaultLanguage) >= 0 ? config.banner.defaultLanguage : available[0];
  }
  function t() {
    return config.strings[lang] || config.strings.en;
  }
  function text(p) {
    return p.text[lang] || p.text.en;
  }

  // ── Script activation ──────────────────────────────────────────────
  function activate(decisions) {
    var blocked = document.querySelectorAll('script[type="text/plain"][data-hp-purpose]');
    for (var i = 0; i < blocked.length; i++) {
      var el = blocked[i];
      var purpose = el.getAttribute("data-hp-purpose");
      if (!decisions[purpose] || el.hasAttribute("data-hp-active")) continue;
      el.setAttribute("data-hp-active", "");
      var s = document.createElement("script");
      for (var j = 0; j < el.attributes.length; j++) {
        var a = el.attributes[j];
        if (a.name !== "type" && a.name !== "data-hp-active") s.setAttribute(a.name, a.value);
      }
      if (!el.src) s.text = el.text;
      el.parentNode.insertBefore(s, el.nextSibling);
    }
  }

  function emit() {
    var detail = { decisions: Object.assign({}, state.decisions), version: state.version };
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](detail);
      } catch (e) {
        console.error(e);
      }
    }
    window.dispatchEvent(new CustomEvent("highpre:consent", { detail: detail }));
  }

  // ── Recording ──────────────────────────────────────────────────────
  function record(action) {
    var payload = {
      siteKey: siteKey,
      principalId: state.principalId,
      action: action,
      noticeVersion: state.version,
      decisions: config.purposes.map(function (p) {
        return { purpose: p.key, granted: !!state.decisions[p.key] };
      }),
      language: lang,
      pageUrl: location.origin + location.pathname,
    };
    if (config.children && state.age) payload.ageGroup = state.age;
    // text/plain avoids a CORS preflight; keepalive survives page navigation.
    fetch(API + "/api/public/consent", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(function () {});
  }

  function decide(decisions, age) {
    var previous = state && state.version === config.version ? state.decisions : null;
    var action = "grant";
    if (previous) {
      action = "update";
      for (var k in previous) if (previous[k] && !decisions[k]) action = "withdraw";
    }
    state = {
      principalId: principalId(),
      version: config.version,
      decisions: decisions,
      at: new Date().toISOString(),
      lang: lang,
      age: age || (state && state.age) || undefined,
    };
    save(state);
    record(action);
    activate(decisions);
    signal();
    emit();
  }

  function allDecisions(granted) {
    var d = {};
    config.purposes.forEach(function (p) {
      d[p.key] = p.essential ? true : granted;
    });
    return d;
  }

  // ── Parental consent ───────────────────────────────────────────────
  function parentalLink() {
    return config.parentalUrl + "?pid=" + encodeURIComponent(state ? state.principalId : "") + "&lang=" + lang;
  }

  /** Applies a parent's decision recorded on the parental page (already in the ledger). */
  function checkParent() {
    if (!state || state.age !== "child" || state.parental) return;
    fetch(config.statusUrl + "?site=" + encodeURIComponent(siteKey) + "&pid=" + encodeURIComponent(state.principalId))
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (s) {
        if (!s || !s.granted || s.version !== config.version) return;
        state.decisions = s.decisions;
        state.parental = true;
        state.at = new Date().toISOString();
        save(state);
        activate(state.decisions);
        signal();
        emit();
        if (currentView === "child") closeBanner();
      })
      .catch(function () {});
  }

  // ── UI ─────────────────────────────────────────────────────────────
  function layout() {
    var b = config.banner;
    return b.layout === "bar" || b.layout === "popup" || b.layout === "box" ? b.layout : b.position === "bottom" ? "bar" : "box";
  }

  function css(b) {
    var dark = b.theme !== "light";
    var mode = layout();
    var customBg = isHex(b.backgroundColor);
    // Without custom colours these match the original dark and light themes exactly.
    var fg = isHex(b.textColor) ? b.textColor : dark ? "#ffffff" : "#000000";
    var bg = customBg ? b.backgroundColor : dark ? "rgba(10,10,10,0.82)" : "rgba(255,255,255,0.9)";
    var muted = withAlpha(fg, isHex(b.textColor) ? 0.72 : dark ? 0.64 : 0.6);
    var line = withAlpha(fg, dark ? 0.14 : 0.12);
    var accent = isHex(b.primaryColor) ? b.primaryColor : fg;
    var onAccent = isHex(b.primaryColor) ? readableOn(b.primaryColor) : dark ? "#000" : "#fff";
    var font = b.fontFamily ? b.fontFamily + "," + SYSTEM_FONT_STACK : SYSTEM_FONT_STACK;
    var left = b.position === "bottom-left";
    var place =
      mode === "bar"
        ? "left:16px;right:16px;bottom:16px;max-width:none;"
        : mode === "popup"
        ? "position:relative;max-width:440px;"
        : left
        ? "left:16px;bottom:16px;"
        : "right:16px;bottom:16px;";
    return (
      ":host{all:initial}" +
      "*{box-sizing:border-box;margin:0;font-family:" + font + ";}" +
      ".card{position:fixed;z-index:2147483646;width:calc(100% - 32px);max-width:390px;color:" + fg + ";background:" + bg + ";" +
      "-webkit-backdrop-filter:blur(28px) saturate(160%);backdrop-filter:blur(28px) saturate(160%);border:1px solid " + line + ";" +
      "border-radius:22px;padding:20px;box-shadow:0 24px 60px -16px rgba(0,0,0,.55);max-height:calc(100vh - 32px);overflow:auto;" +
      "animation:in .6s cubic-bezier(.16,1,.3,1) both}" +
      ".card." + mode + "{" + place + "}" +
      ".card:focus{outline:none}" +
      // Full-width bar: text beside the buttons on wide screens; other views stay a readable width.
      ".bar:not(.sum){max-width:560px;margin:0 auto}" +
      "@media (min-width:760px){.bar.sum{display:grid;grid-template-columns:minmax(0,1fr) 340px;column-gap:28px;align-items:center}" +
      ".bar.sum .act .row:first-child{margin-top:0}.bar.sum .links{grid-column:1/-1;justify-content:flex-start;margin-top:10px}}" +
      // Popup: centred over a dimmed page. Clicking the backdrop does nothing; only a choice closes it.
      ".wrap{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.45);outline:none}" +
      "@keyframes in{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}" +
      "h2{font-size:15px;font-weight:600;letter-spacing:-.01em;line-height:1.35}" +
      "p{font-size:13px;line-height:1.55;color:" + muted + ";margin-top:6px}" +
      ".row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}" +
      ".one{grid-template-columns:1fr;margin-top:8px}" +
      "button{cursor:pointer;font:inherit;font-size:13px;font-weight:500;border-radius:999px;min-height:40px;padding:8px 14px;line-height:1.25;transition:transform .2s,opacity .2s}" +
      "button:active{transform:scale(.97)}" +
      "button:focus-visible,select:focus-visible{outline:2px solid " + fg + ";outline-offset:2px}" +
      ".solid{background:" + accent + ";color:" + onAccent + ";border:0}" +
      ".line{background:transparent;color:" + fg + ";border:1px solid " + line + "}" +
      ".links{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:14px;margin-top:12px}" +
      ".links a,.links button{all:unset;cursor:pointer;font-size:12px;color:" + muted + "}" +
      ".links a:hover,.links button:hover{color:" + fg + "}" +
      ".links a:focus-visible,.links button:focus-visible{outline:2px solid " + fg + ";outline-offset:2px;border-radius:4px}" +
      "select{font:inherit;font-size:12px;color:" + fg + ";background:transparent;border:1px solid " + line + ";border-radius:999px;padding:3px 8px}" +
      "select option{color:#000}" +
      "ul{list-style:none;padding:0;margin-top:14px;border:1px solid " + line + ";border-radius:16px;max-height:44vh;overflow:auto}" +
      "li{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:12px 14px}" +
      "li+li{border-top:1px solid " + line + "}" +
      "li strong{display:block;font-size:13px;font-weight:500}" +
      "li span{display:block;font-size:12px;line-height:1.45;color:" + muted + ";margin-top:2px}" +
      ".sw{position:relative;flex:none;width:38px;height:22px;margin-top:2px}" +
      ".sw input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}" +
      ".sw i{position:absolute;inset:0;border-radius:99px;background:" + line + ";transition:background .25s}" +
      ".sw i:after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:" + fg + ";transition:transform .25s cubic-bezier(.16,1,.3,1),background .25s}" +
      ".sw input:checked+i{background:" + accent + "}" +
      ".sw input:checked+i:after{transform:translateX(16px);background:" + onAccent + "}" +
      ".sw input:disabled{cursor:not-allowed}.sw input:disabled+i{opacity:.55}" +
      ".sw input:focus-visible+i{outline:2px solid " + fg + ";outline-offset:2px}" +
      ".fab{position:fixed;" + (left ? "left:16px;" : "right:16px;") + "bottom:16px;z-index:2147483645;width:44px;height:44px;min-height:0;padding:0;display:grid;place-items:center;" +
      "background:" + bg + ";-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border:1px solid " + line + ";color:" + fg + "}" +
      "@media (prefers-reduced-motion:reduce){.card{animation:none}*{transition:none!important}}"
    );
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "text") node.textContent = attrs[k];
      else if (k === "on") node.addEventListener("click", attrs[k]);
      else node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(c);
    });
    return node;
  }

  function mount() {
    if (host) return;
    host = document.createElement("div");
    host.setAttribute("data-highpre", "");
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    root.addEventListener("keydown", onKey);
    document.body.appendChild(host);
  }

  function clear() {
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(el("style", { text: css(config.banner) }));
  }

  // ── Keyboard: Escape and the popup's focus trap ────────────────────
  function activeEl() {
    return (root && root.activeElement) || document.activeElement;
  }

  function onKey(e) {
    if (currentView === "closed") return;
    if (e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      escape();
    } else if (e.key === "Tab" && layout() === "popup") {
      var c = root.querySelector(".card");
      var f = c ? c.querySelectorAll("a[href],button:not([disabled]),select,input:not([disabled])") : [];
      if (!f.length) return;
      var first = f[0];
      var last = f[f.length - 1];
      var active = activeEl();
      if (e.shiftKey && (active === first || active === c)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  /**
   * Escape never counts as consent. From the purpose list it steps back (or,
   * after a choice was made, just closes); otherwise it hides the banner with
   * nothing optional granted and nothing recorded. The banner comes back on
   * the next page, and the settings button stays available meanwhile.
   */
  function escape() {
    if (currentView === "choose" && !liveDecisions()) render("summary", true);
    else closeBanner(true);
  }

  function setLanguage(code) {
    if (codes().indexOf(code) < 0) return;
    lang = code;
    if (state) {
      state.lang = code;
      save(state);
    }
    if (root && root.querySelector(".card")) render(currentView, true);
  }

  function languageControl() {
    var list = config.languages;
    if (list.length < 2) return null;
    if (list.length === 2) {
      var other = list[0].code === lang ? list[1] : list[0];
      return el("button", { type: "button", lang: other.code, text: other.name, on: function () { setLanguage(other.code); } });
    }
    var select = el("select", { "aria-label": t().language });
    list.forEach(function (l) {
      var o = el("option", { value: l.code, lang: l.code, text: l.name });
      if (l.code === lang) o.selected = true;
      select.appendChild(o);
    });
    select.addEventListener("change", function () {
      setLanguage(select.value);
    });
    return select;
  }

  function footerLinks() {
    return el("div", { class: "links" }, [
      el("a", { href: config.noticeUrl + "?lang=" + lang, target: "_blank", rel: "noopener", text: t().notice }),
      el("a", { href: config.rightsUrl + "?lang=" + lang, target: "_blank", rel: "noopener", text: t().rights }),
      languageControl(),
    ]);
  }

  function card(title, body, view) {
    var mode = layout();
    var c = el("div", {
      class: "card " + mode + (view === "summary" ? " sum" : ""),
      role: "dialog",
      "aria-modal": mode === "popup" ? "true" : "false",
      "aria-labelledby": "hp-title",
      tabindex: "-1",
      lang: lang,
    });
    c.appendChild(el("div", {}, [el("h2", { id: "hp-title", text: title }), body ? el("p", { text: body }) : null]));
    return c;
  }

  function row(buttons, single) {
    return el("div", { class: single ? "row one" : "row" }, buttons);
  }
  function button(cls, label, fn) {
    return el("button", { type: "button", class: cls, text: label, on: fn });
  }

  /** Draws a view. `focus` moves focus into the banner (after a click or key); the popup always takes focus. */
  function render(view, focus) {
    if (currentView === "closed" || !root || !root.querySelector(".card")) lastFocus = document.activeElement;
    currentView = view;
    mount();
    clear();
    var s = t();
    var c;

    if (view === "age") {
      c = card(s.ageTitle, s.ageBody, view);
      c.appendChild(
        row([
          button("line", s.ageChild, function () {
            // Essential only until a parent consents.
            decide(allDecisions(false), "child");
            render("child", true);
          }),
          button("line", s.ageAdult, function () {
            state = { principalId: principalId(), version: 0, decisions: {}, lang: lang, age: "adult" };
            render("summary", true);
          }),
        ]),
      );
    } else if (view === "child") {
      c = card(s.childTitle, state && state.parental ? null : s.childBody + " " + s.waitingParent, view);
      c.appendChild(
        row(
          [
            el("a", { href: parentalLink(), target: "_blank", rel: "noopener", class: "solid", style: "display:grid;place-items:center;text-decoration:none;border-radius:999px;min-height:40px;font-size:13px;font-weight:500;padding:8px 14px", text: s.askParent }),
            button("line", s.essentialOnly, function () {
              closeBanner(true);
            }),
          ],
          true,
        ),
      );
    } else if (view === "choose") {
      var current = (state && state.version === config.version && state.decisions) || allDecisions(false);
      c = card(s.defaultTitle, s.defaultMessage, view);
      var list = el("ul");
      config.purposes.forEach(function (p) {
        var id = "hp-" + p.key;
        var info = text(p);
        var input = el("input", { type: "checkbox", id: id, "data-key": p.key, "aria-label": info.name });
        input.checked = p.essential ? true : !!current[p.key];
        if (p.essential) input.disabled = true;
        list.appendChild(
          el("li", {}, [
            el("label", { for: id }, [el("strong", { text: info.name }), el("span", { text: p.essential ? s.essential + ". " + info.description : info.description })]),
            el("span", { class: "sw" }, [input, el("i")]),
          ]),
        );
      });
      c.appendChild(list);
      c.appendChild(
        row([
          button("line", s.back, function () {
            render("summary", true);
          }),
          button("solid", s.save, function () {
            var d = {};
            list.querySelectorAll("input").forEach(function (i) {
              d[i.getAttribute("data-key")] = i.checked;
            });
            decide(d);
            closeBanner(true);
          }),
        ]),
      );
    } else {
      c = card(s.defaultTitle, s.defaultMessage, view);
      // Accept and reject get equal weight: no nudging toward "yes".
      c.appendChild(
        el("div", { class: "act" }, [
          row([
            button("line", s.rejectAll, function () {
              decide(allDecisions(false));
              closeBanner(true);
            }),
            button("line", s.acceptAll, function () {
              decide(allDecisions(true));
              closeBanner(true);
            }),
          ]),
          row([button("solid", s.choose, function () { render("choose", true); })], true),
        ]),
      );
    }
    c.appendChild(footerLinks());
    // The popup sits on a backdrop that keeps focus inside; clicking it isn't a choice.
    root.appendChild(layout() === "popup" ? el("div", { class: "wrap", tabindex: "-1" }, [c]) : c);
    if (focus || layout() === "popup") c.focus();
  }

  function reopen() {
    render(state && state.age === "child" ? "child" : "choose", true);
  }

  /**
   * Hides the banner. The settings button stays when the site wants it, and
   * always while the visitor hasn't chosen yet (they closed it with Escape).
   */
  function closeBanner(focus) {
    if (!root) return;
    currentView = "closed";
    clear();
    var fab = null;
    if (config.banner.showReopenButton || !liveDecisions()) {
      var icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>';
      fab = el("button", { type: "button", class: "fab", "aria-label": t().settings, title: t().settings, on: reopen });
      fab.innerHTML = icon;
      root.appendChild(fab);
    }
    if (focus === true) {
      if (fab) fab.focus();
      else if (lastFocus && lastFocus.focus && lastFocus !== host) lastFocus.focus();
    }
  }

  // ── Boot ───────────────────────────────────────────────────────────
  window.HighPre = {
    open: function () {
      if (config && config.ready) reopen();
    },
    getConsent: function () {
      return state && state.version ? Object.assign({}, state.decisions) : null;
    },
    onChange: function (fn) {
      if (typeof fn === "function") listeners.push(fn);
    },
    setLanguage: function (code) {
      if (config) setLanguage(code);
    },
  };

  // ── Privacy centre badge ───────────────────────────────────────────
  /** The site's page footer: the last <footer> (or role=contentinfo) that isn't part of an article or card. */
  function pageFooter() {
    var all = document.querySelectorAll("footer, [role=contentinfo]");
    for (var i = all.length - 1; i >= 0; i--) {
      if (!all[i].closest("article, section, aside, [role=dialog]")) return all[i];
    }
    return null;
  }

  /**
   * Draws the badge switched on in the dashboard, with no extra tags: inside an
   * element with data-hp-badge if the site has one; otherwise inside the site's
   * footer (or at the end of the page if there's none), or fixed in the corner
   * opposite the settings button.
   */
  function renderBadge(b) {
    if (!b || document.getElementById("hp-badge")) return;
    var holder = document.createElement("div");
    holder.id = "hp-badge";
    var target = document.querySelector("[data-hp-badge]");
    var footer = !target && b.placement !== "corner" ? pageFooter() : null;
    if (target) {
      holder.style.cssText = "display:inline-block;line-height:0";
      target.appendChild(holder);
    } else if (footer) {
      holder.style.cssText = "display:flex;justify-content:center;padding:12px 0;line-height:0;clear:both";
      footer.appendChild(holder);
    } else if (b.placement === "corner") {
      var side = config.banner.position === "bottom-left" ? "right" : "left";
      holder.style.cssText = "position:fixed;bottom:16px;" + side + ":16px;z-index:2147483640;line-height:0";
      document.body.appendChild(holder);
    } else {
      holder.style.cssText = "display:flex;justify-content:center;padding:16px;line-height:0;clear:both";
      document.body.appendChild(holder);
    }
    var r = holder.attachShadow ? holder.attachShadow({ mode: "open" }) : holder;
    var link = el("a", { href: b.url, target: "_blank", rel: "noopener", "aria-label": b.label });
    link.style.cssText = "display:inline-block;line-height:0;border-radius:999px";
    var img = el("img", { src: b.image, alt: b.label, width: String(b.width), height: String(b.height) });
    img.style.cssText = "display:block;width:" + b.width + "px;height:" + b.height + "px;max-width:none;border:0";
    link.appendChild(img);
    r.appendChild(link);
  }

  function boot() {
    fetch(API + "/api/public/config/" + encodeURIComponent(siteKey))
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (c) {
        if (!c || !c.ready) return;
        config = c;
        state = load();
        lang = pickLanguage();
        syncConsentMode();
        initForms({ config: config, siteKey: siteKey, api: API, lang: function () { return lang; }, principalId: principalId });
        renderBadge(config.badge);
        var current = state && state.version === config.version;

        if (config.children && state && state.age === "child") {
          // A child stays on essentials until a parent's consent for this notice version arrives.
          if (!current) decide(allDecisions(false), "child");
          activate(state.decisions);
          emit();
          mount();
          closeBanner();
          checkParent();
          document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "visible") checkParent();
          });
        } else if (current) {
          activate(state.decisions);
          emit();
          mount();
          closeBanner();
        } else {
          render(config.children && !(state && state.age === "adult") ? "age" : "summary");
        }
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
