/*
 * HighPre content script, loaded only on AI assistants, chat apps and paste
 * sites (see manifest.json). It checks text as it is pasted, dropped or sent,
 * and asks before sensitive data goes into the page. Detection runs here, in
 * the browser; only the kind of data, the app and the person's choice are
 * passed to the background worker for reporting. The text itself never leaves.
 */
(function () {
  "use strict";

  var catalog = self.HIGHPRE_CATALOG;
  var detect = self.HighPreDetect && self.HighPreDetect.detect;
  var app = catalog && catalog.sites[location.hostname];
  if (!app || !detect) return;

  var state = { policy: null, removed: false, orgName: "your organisation" };
  var bypass = false; // set while we re-deliver a paste the person approved
  var allowOnce = null; // text the person chose to send anyway
  var lastEditable = null;
  var dialogOpen = false;

  function applyStored(v) {
    if (v.policy) state.policy = v.policy;
    if (v.status) state.removed = v.status === "removed";
    if (v.orgName) state.orgName = v.orgName;
  }
  chrome.storage.local.get(["policy", "status", "orgName"], applyStored);
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local") return;
    var v = {};
    Object.keys(changes).forEach(function (k) { v[k] = changes[k].newValue; });
    applyStored(v);
  });

  function active() {
    if (state.removed) return false;
    return !(state.policy && state.policy.allowedApps && state.policy.allowedApps.indexOf(app) >= 0);
  }

  function blockMode() {
    return Boolean(state.policy && state.policy.extensionMode === "block");
  }

  function sensitive(text, options) {
    var kinds = detect(text, options);
    var watched = state.policy && state.policy.dataTypes;
    return watched ? kinds.filter(function (k) { return watched.indexOf(k) >= 0; }) : kinds;
  }

  function report(kinds, outcome) {
    try {
      chrome.runtime.sendMessage({ type: "detection", kinds: kinds, app: app, outcome: outcome });
    } catch {
      // The extension was reloaded; nothing to report to.
    }
  }

  function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") return /^(text|search|url|email|)$/i.test(el.type || "");
    return el.isContentEditable;
  }

  function editableFrom(el) {
    while (el && el.nodeType === 1) {
      if (isEditable(el)) {
        // For rich editors, use the outermost editable element (the whole message).
        while (el.parentElement && el.parentElement.isContentEditable) el = el.parentElement;
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function textOf(el) {
    if (!el) return "";
    return el.tagName === "TEXTAREA" || el.tagName === "INPUT" ? el.value : el.innerText || "";
  }

  function describe(kinds) {
    var labels = kinds.map(function (k) { return catalog.data[k] || k; });
    if (labels.length === 1) return labels[0];
    return labels.slice(0, -1).join(", ") + " and " + labels[labels.length - 1];
  }

  /* ── Warning dialog (Shadow DOM, so the page's styles can't reach it) ── */

  var STYLE =
    ":host{all:initial}" +
    ".backdrop{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}" +
    ".card{max-width:420px;width:100%;background:#16161a;color:#f4f4f5;border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.5);padding:22px}" +
    ".brand{display:flex;align-items:center;gap:8px;font-size:12px;color:#a1a1aa;margin-bottom:12px}" +
    ".dot{width:8px;height:8px;border-radius:50%;background:#f59e0b}" +
    "h2{margin:0 0 8px;font-size:17px;font-weight:600}" +
    "p{margin:0 0 10px;color:#d4d4d8}" +
    ".note{font-size:12px;color:#a1a1aa}" +
    ".actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}" +
    "button{font:inherit;border-radius:10px;padding:8px 14px;cursor:pointer;border:1px solid rgba(255,255,255,.16);background:transparent;color:#f4f4f5}" +
    "button.primary{background:#f4f4f5;color:#111;border-color:#f4f4f5;font-weight:600}" +
    "button.link{border:0;padding:8px 4px;color:#a1a1aa;text-decoration:underline}" +
    "button:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}";

  function ask(kinds, action, done) {
    if (dialogOpen) return;
    dialogOpen = true;
    var host = document.createElement("highpre-warning");
    var shadow = host.attachShadow({ mode: "closed" });
    var appName = catalog.apps[app] || "this site";
    var verb = action === "paste" ? "Pasting" : "Sending";
    var block = blockMode();

    var buttons = block
      ? [
          { label: "OK", outcome: "blocked", cls: "primary" },
          { label: "Report a false alarm", outcome: "not_sensitive_blocked", cls: "link" },
        ]
      : [
          { label: action === "paste" ? "Don't paste" : "Edit message", outcome: "stopped", cls: "primary" },
          { label: action === "paste" ? "Paste anyway" : "Send anyway", outcome: "sent_anyway", cls: "" },
          { label: "It isn't sensitive", outcome: "not_sensitive", cls: "link" },
        ];

    var style = document.createElement("style");
    style.textContent = STYLE;
    var backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    var card = document.createElement("div");
    card.className = "card";
    card.setAttribute("role", "alertdialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "hp-title");
    card.setAttribute("aria-describedby", "hp-body");

    var brand = document.createElement("div");
    brand.className = "brand";
    brand.innerHTML = '<span class="dot"></span>';
    brand.appendChild(document.createTextNode("HighPre · " + state.orgName));
    var h = document.createElement("h2");
    h.id = "hp-title";
    h.textContent = "This looks like " + describe(kinds);
    var p = document.createElement("p");
    p.id = "hp-body";
    p.textContent = block
      ? verb + " it into " + appName + " isn't allowed by " + state.orgName + ". Remove it and try again."
      : verb + " it into " + appName + " could expose it outside " + state.orgName + ".";
    var note = document.createElement("p");
    note.className = "note";
    note.textContent = state.orgName + "'s owners see the kind of data and what you chose. What you " + (action === "paste" ? "pasted" : "typed") + " stays in this browser.";
    var actions = document.createElement("div");
    actions.className = "actions";

    function close(outcome) {
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      dialogOpen = false;
      done(outcome);
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close(block ? "blocked" : "stopped");
      }
    }
    buttons.forEach(function (b) {
      var el = document.createElement("button");
      el.type = "button";
      el.textContent = b.label;
      if (b.cls) el.className = b.cls;
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        close(b.outcome);
      });
      actions.appendChild(el);
    });

    card.append(brand, h, p, note, actions);
    backdrop.appendChild(card);
    shadow.append(style, backdrop);
    (document.body || document.documentElement).appendChild(host);
    document.addEventListener("keydown", onKey, true);
    actions.firstChild.focus();
  }

  /* ── Paste and drop ── */

  function saveSelection() {
    var sel = window.getSelection();
    return sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  }

  function restoreSelection(target, range) {
    target.focus();
    if (range && target.isContentEditable) {
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // Delivers text the person approved, as a paste the page can handle itself
  // (rich editors), falling back to inserting it as typed text.
  function deliver(target, range, text) {
    restoreSelection(target, range);
    var dt = new DataTransfer();
    dt.setData("text/plain", text);
    bypass = true;
    var unhandled = true;
    try {
      unhandled = target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    } finally {
      bypass = false;
    }
    if (unhandled) document.execCommand("insertText", false, text);
  }

  function intercept(e, text) {
    if (bypass || !active() || !text) return;
    var kinds = sensitive(text);
    if (!kinds.length) return;
    var target = editableFrom(e.target) || e.target;
    e.preventDefault();
    e.stopImmediatePropagation();
    var range = saveSelection();
    ask(kinds, "paste", function (outcome) {
      if (outcome === "not_sensitive_blocked") outcome = "not_sensitive";
      else if (outcome === "sent_anyway" || outcome === "not_sensitive") deliver(target, range, text);
      else restoreSelection(target, range);
      report(kinds, outcome);
    });
  }

  window.addEventListener("paste", function (e) {
    intercept(e, e.clipboardData && e.clipboardData.getData("text/plain"));
  }, true);

  window.addEventListener("drop", function (e) {
    intercept(e, e.dataTransfer && e.dataTransfer.getData("text/plain"));
  }, true);

  /* ── Sending typed messages (Enter or a Send button) ── */

  document.addEventListener("focusin", function (e) {
    var el = editableFrom(e.target);
    if (el) lastEditable = el;
  }, true);

  function checkSend(e, composer, resend) {
    if (bypass || !active() || !composer) return;
    var text = textOf(composer);
    if (!text.trim()) return;
    if (allowOnce !== null && allowOnce === text) {
      allowOnce = null;
      return;
    }
    var kinds = sensitive(text, { bare: false });
    if (!kinds.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    ask(kinds, "send", function (outcome) {
      if (outcome === "not_sensitive_blocked") outcome = "not_sensitive";
      else if (outcome === "sent_anyway" || outcome === "not_sensitive") {
        allowOnce = text;
        composer.focus();
        resend();
      } else composer.focus();
      report(kinds, outcome);
    });
  }

  window.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.altKey) return;
    var composer = editableFrom(e.target);
    if (!composer || composer.tagName === "INPUT") return;
    checkSend(e, composer, function () {
      composer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    });
  }, true);

  var SEND_LABEL = /\b(send|submit)\b|send-button|composer-submit/i;

  window.addEventListener("click", function (e) {
    var button = e.target && e.target.closest && e.target.closest("button,[role=button]");
    if (!button) return;
    var label = [button.getAttribute("aria-label"), button.getAttribute("data-testid"), button.getAttribute("title"), button.id].join(" ");
    if (!SEND_LABEL.test(label)) return;
    var form = button.closest("form");
    var composer = (form && editableFrom(form.querySelector("textarea,[contenteditable=true],[contenteditable='']"))) || (lastEditable && lastEditable.isConnected ? lastEditable : null);
    checkSend(e, composer, function () { button.click(); });
  }, true);
})();
