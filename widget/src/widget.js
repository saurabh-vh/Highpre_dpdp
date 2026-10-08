/*!
 * HighPre consent widget
 * <script src="https://highpre.com/widget.js" data-hp-site="SITE_KEY" async></script>
 *
 * - Shows a consent banner for the site's published notice and purposes.
 * - Speaks every language the site publishes, starting with the visitor's own.
 * - Activates <script type="text/plain" data-hp-purpose="key"> only after consent.
 * - Records every decision in the HighPre consent ledger.
 * - Offers a persistent button to change or withdraw consent.
 * - Optional age check: under-18s get essential purposes only until a parent
 *   or guardian consents on a verified page; tracking stays off for them.
 * - Identifies visitors only by a random ID stored in localStorage. No cookies,
 *   no fingerprinting.
 *
 * Public API: window.HighPre.open(), .getConsent(), .onChange(fn), .setLanguage(code)
 * Event: window "highpre:consent" with detail { decisions, version }
 */
(function () {
  "use strict";

  var script =
    document.currentScript ||
    document.querySelector("script[data-hp-site]") ||
    document.querySelector('script[src*="widget.js"][data-site]');
  if (!script || window.HighPre) return;

  var siteKey = script.getAttribute("data-hp-site") || script.getAttribute("data-site");
  if (!siteKey) return console.warn("[HighPre] Missing data-hp-site attribute.");

  var API = new URL(script.src).origin;
  var STORE_KEY = "hp_consent_" + siteKey;
  var listeners = [];
  var config = null;
  // { principalId, version, decisions: { key: bool }, at, lang, age: "adult"|"child", parental: bool }
  var state = null;
  var lang = "en";
  var host, root;
  var currentView = "summary";

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
        emit();
        if (currentView === "child") closeBanner();
      })
      .catch(function () {});
  }

  // ── UI ─────────────────────────────────────────────────────────────
  function css(theme, position) {
    var dark = theme !== "light";
    var fg = dark ? "#fff" : "#000";
    var bg = dark ? "rgba(10,10,10,0.82)" : "rgba(255,255,255,0.9)";
    var muted = dark ? "rgba(255,255,255,0.64)" : "rgba(0,0,0,0.6)";
    var line = dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";
    var place =
      position === "bottom"
        ? "left:16px;right:16px;bottom:16px;max-width:none;"
        : position === "bottom-left"
        ? "left:16px;bottom:16px;"
        : "right:16px;bottom:16px;";
    return (
      ":host{all:initial}" +
      "*{box-sizing:border-box;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans','Noto Sans Devanagari','Noto Sans Bengali','Noto Sans Tamil','Noto Sans Telugu','Noto Sans Gujarati','Noto Sans Kannada',sans-serif;}" +
      ".card{position:fixed;" + place + "z-index:2147483646;width:calc(100% - 32px);max-width:390px;color:" + fg + ";background:" + bg + ";" +
      "-webkit-backdrop-filter:blur(28px) saturate(160%);backdrop-filter:blur(28px) saturate(160%);border:1px solid " + line + ";" +
      "border-radius:22px;padding:20px;box-shadow:0 24px 60px -16px rgba(0,0,0,.55);max-height:calc(100vh - 32px);overflow:auto;" +
      "animation:in .6s cubic-bezier(.16,1,.3,1) both}" +
      "@keyframes in{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}" +
      "h2{font-size:15px;font-weight:600;letter-spacing:-.01em;line-height:1.35}" +
      "p{font-size:13px;line-height:1.55;color:" + muted + ";margin-top:6px}" +
      ".row{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}" +
      ".one{grid-template-columns:1fr;margin-top:8px}" +
      "button{cursor:pointer;font:inherit;font-size:13px;font-weight:500;border-radius:999px;min-height:40px;padding:8px 14px;line-height:1.25;transition:transform .2s,opacity .2s}" +
      "button:active{transform:scale(.97)}" +
      "button:focus-visible,select:focus-visible{outline:2px solid " + fg + ";outline-offset:2px}" +
      ".solid{background:" + fg + ";color:" + (dark ? "#000" : "#fff") + ";border:0}" +
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
      ".sw input:checked+i{background:" + fg + "}" +
      ".sw input:checked+i:after{transform:translateX(16px);background:" + (dark ? "#000" : "#fff") + "}" +
      ".sw input:disabled{cursor:not-allowed}.sw input:disabled+i{opacity:.55}" +
      ".sw input:focus-visible+i{outline:2px solid " + fg + ";outline-offset:2px}" +
      ".fab{position:fixed;" + (position === "bottom-left" ? "left:16px;" : "right:16px;") + "bottom:16px;z-index:2147483645;width:44px;height:44px;min-height:0;padding:0;display:grid;place-items:center;" +
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
    document.body.appendChild(host);
  }

  function clear() {
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(el("style", { text: css(config.banner.theme, config.banner.position) }));
  }

  function setLanguage(code) {
    if (codes().indexOf(code) < 0) return;
    lang = code;
    if (state) {
      state.lang = code;
      save(state);
    }
    if (root && root.querySelector(".card")) render(currentView);
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

  function card(title, body) {
    var c = el("div", { class: "card", role: "dialog", "aria-modal": "false", "aria-labelledby": "hp-title", lang: lang });
    c.appendChild(el("h2", { id: "hp-title", text: title }));
    if (body) c.appendChild(el("p", { text: body }));
    return c;
  }

  function row(buttons, single) {
    return el("div", { class: single ? "row one" : "row" }, buttons);
  }
  function button(cls, label, fn) {
    return el("button", { type: "button", class: cls, text: label, on: fn });
  }

  function render(view) {
    currentView = view;
    mount();
    clear();
    var s = t();
    var c;

    if (view === "age") {
      c = card(s.ageTitle, s.ageBody);
      c.appendChild(
        row([
          button("line", s.ageChild, function () {
            // Essential only until a parent consents.
            decide(allDecisions(false), "child");
            render("child");
          }),
          button("line", s.ageAdult, function () {
            state = { principalId: principalId(), version: 0, decisions: {}, lang: lang, age: "adult" };
            render("summary");
          }),
        ]),
      );
    } else if (view === "child") {
      c = card(s.childTitle, state && state.parental ? null : s.childBody + " " + s.waitingParent);
      c.appendChild(
        row(
          [
            el("a", { href: parentalLink(), target: "_blank", rel: "noopener", class: "solid", style: "display:grid;place-items:center;text-decoration:none;border-radius:999px;min-height:40px;font-size:13px;font-weight:500;padding:8px 14px", text: s.askParent }),
            button("line", s.essentialOnly, closeBanner),
          ],
          true,
        ),
      );
    } else if (view === "choose") {
      var current = (state && state.version === config.version && state.decisions) || allDecisions(false);
      c = card(s.defaultTitle, s.defaultMessage);
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
            render("summary");
          }),
          button("solid", s.save, function () {
            var d = {};
            list.querySelectorAll("input").forEach(function (i) {
              d[i.getAttribute("data-key")] = i.checked;
            });
            decide(d);
            closeBanner();
          }),
        ]),
      );
    } else {
      c = card(s.defaultTitle, s.defaultMessage);
      // Accept and reject get equal weight: no nudging toward "yes".
      c.appendChild(
        row([
          button("line", s.rejectAll, function () {
            decide(allDecisions(false));
            closeBanner();
          }),
          button("line", s.acceptAll, function () {
            decide(allDecisions(true));
            closeBanner();
          }),
        ]),
      );
      c.appendChild(row([button("solid", s.choose, function () { render("choose"); })], true));
    }
    c.appendChild(footerLinks());
    root.appendChild(c);
  }

  function reopen() {
    render(state && state.age === "child" ? "child" : "choose");
  }

  function closeBanner() {
    if (!root) return;
    currentView = "closed";
    clear();
    if (config.banner.showReopenButton) {
      var icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>';
      var fab = el("button", { type: "button", class: "fab", "aria-label": t().settings, title: t().settings, on: reopen });
      fab.innerHTML = icon;
      root.appendChild(fab);
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
