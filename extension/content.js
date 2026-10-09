/*
 * HighPre content script, loaded only on AI assistants, chat apps, email and
 * sharing sites (see manifest.json). It checks text as it is pasted, dropped or
 * sent, and files as they are attached, and asks before sensitive data goes
 * into the page. Detection runs here, in the browser; only the kind of data,
 * the app, how it was shared ("via") and the person's choice are passed to the
 * background worker for reporting. The text and files themselves never leave.
 */
(function () {
  "use strict";

  var catalog = self.HIGHPRE_CATALOG;
  var detect = self.HighPreDetect && self.HighPreDetect.detect;
  var mask = self.HighPreDetect && self.HighPreDetect.mask;
  var files = self.HighPreFiles;
  var app = catalog && catalog.sites[location.hostname];
  if (!app || !detect) return;
  try { chrome.runtime.sendMessage({ type: "seen", app: app }); } catch { /* AI tools report: background.js counts days, AI apps only */ }

  /*
   * Everyday work tools. Email and file-sharing sites (Gmail, Outlook, Drive,
   * Dropbox, WeTransfer) are where people do normal work, and a customer's
   * phone number in an email is ordinary. So there, only attached files (any
   * watched kind) and pasted or sent text with high-severity data (passwords,
   * keys, card, bank and Aadhaar numbers) warn, and Enter isn't treated as
   * "send" (it starts a new line in an email). Paste sites like Pastebin are
   * public, so they keep the full checks.
   */
  var category = catalog.categories && catalog.categories[app];
  var EVERYDAY = category === "email" || (category === "sharing" && app !== "pastebin");
  var HIGH = catalog.high || [];

  var state = { policy: null, removed: false, orgName: "your organisation" };
  var bypass = false; // set while we re-deliver a paste, drop or file the person approved
  var allowOnce = null; // text the person chose to send anyway
  var lastEditable = null;
  var dialogOpen = false;
  var FILE_CHECK_MS = 1500; // a file check that takes longer is let through: uploads must never break

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

  /** Watched kinds in text. `everyRule` skips the everyday-tools relaxation (files, and checking hidden text). */
  function sensitive(text, options, everyRule) {
    var kinds = detect(text, options);
    var watched = state.policy && state.policy.dataTypes;
    if (watched) kinds = kinds.filter(function (k) { return watched.indexOf(k) >= 0; });
    if (EVERYDAY && !everyRule) kinds = kinds.filter(function (k) { return HIGH.indexOf(k) >= 0; });
    return kinds;
  }

  /** The text with private details hidden, or null when hiding can't make it safe. */
  function hidden(text, options) {
    if (!mask) return null;
    var out = mask(text, options).text;
    return out !== text && !sensitive(out, options, true).length ? out : null;
  }

  // via: "paste", "drop", "typed" or "file". Never the text, file name or page.
  function report(kinds, outcome, via) {
    try {
      chrome.runtime.sendMessage({ type: "detection", kinds: kinds, app: app, outcome: outcome, via: via });
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

  /*
   * Choices, by what is being shared ("paste", "send" or "file") and the
   * organisation's mode. Hiding details comes first when it can make the text
   * safe; it's offered in block mode too, since hidden data isn't the raw data.
   */
  function choices(action, block, canMask) {
    if (action === "file") {
      return block
        ? [
            { label: "OK", outcome: "blocked", cls: "primary" },
            { label: "Report a false alarm", outcome: "not_sensitive_blocked", cls: "link" },
          ]
        : [
            { label: "Don't share", outcome: "stopped", cls: "primary" },
            { label: "Share anyway", outcome: "sent_anyway", cls: "" },
            { label: "It isn't sensitive", outcome: "not_sensitive", cls: "link" },
          ];
    }
    var paste = action === "paste";
    var list = canMask ? [{ label: paste ? "Paste with details hidden" : "Hide details and send", outcome: "masked", cls: "primary" }] : [];
    var second = canMask ? "" : "primary";
    if (block) {
      list.push({ label: "OK", outcome: "blocked", cls: second }, { label: "Report a false alarm", outcome: "not_sensitive_blocked", cls: "link" });
    } else {
      list.push(
        { label: paste ? "Don't paste" : "Edit message", outcome: "stopped", cls: second },
        { label: paste ? "Paste anyway" : "Send anyway", outcome: "sent_anyway", cls: "" },
        { label: "It isn't sensitive", outcome: "not_sensitive", cls: "link" },
      );
    }
    return list;
  }

  function ask(kinds, action, done, canMask) {
    if (dialogOpen) return;
    dialogOpen = true;
    var host = document.createElement("highpre-warning");
    var shadow = host.attachShadow({ mode: "closed" });
    var appName = catalog.apps[app] || "this site";
    var block = blockMode();
    var file = action === "file";
    var verb = action === "paste" ? "Pasting" : "Sending";
    var buttons = choices(action, block, canMask);

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
    h.textContent = (file ? "This file has " : "This looks like ") + describe(kinds);
    var p = document.createElement("p");
    p.id = "hp-body";
    if (file) {
      p.textContent = block
        ? "Sharing files like this on " + appName + " isn't allowed by " + state.orgName + "."
        : "Sharing it on " + appName + " could expose it outside " + state.orgName + ". Share it anyway?";
    } else if (block) {
      p.textContent = canMask
        ? verb + " it into " + appName + " isn't allowed by " + state.orgName + ", but you can with the private details hidden."
        : verb + " it into " + appName + " isn't allowed by " + state.orgName + ". Remove it and try again.";
    } else {
      p.textContent = verb + " it into " + appName + " could expose it outside " + state.orgName + "." + (canMask ? " You can hide the private details and keep the rest." : "");
    }
    var note = document.createElement("p");
    note.className = "note";
    note.textContent =
      state.orgName + "'s owners see the kind of data and what you chose. " +
      (file ? "The file was checked on this computer and isn't sent to HighPre." : "What you " + (action === "paste" ? "pasted" : "typed") + " stays in this browser.");
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

  function intercept(e, text, via) {
    if (bypass || !active() || !text) return;
    var kinds = sensitive(text);
    if (!kinds.length) return;
    var target = editableFrom(e.target) || e.target;
    e.preventDefault();
    e.stopImmediatePropagation();
    var range = saveSelection();
    var safe = hidden(text);
    ask(kinds, "paste", function (outcome) {
      if (outcome === "not_sensitive_blocked") outcome = "not_sensitive";
      else if (outcome === "masked") deliver(target, range, safe);
      else if (outcome === "sent_anyway" || outcome === "not_sensitive") deliver(target, range, text);
      else restoreSelection(target, range);
      report(kinds, outcome, via);
    }, safe !== null);
  }

  /* ── Attached files (file pickers, dropped and pasted files) ── */

  function fileList(list) {
    return list ? Array.prototype.slice.call(list) : [];
  }

  function transferOf(list) {
    var dt = new DataTransfer();
    list.forEach(function (f) { dt.items.add(f); });
    return dt;
  }

  // Runs `fn` so that our own listeners let the events it dispatches through.
  function withBypass(fn) {
    bypass = true;
    try {
      fn();
    } finally {
      bypass = false;
    }
  }

  /** Resolves to the watched kinds found in the files; [] if the check fails or takes too long. */
  function checkFiles(list) {
    var order = Object.keys(catalog.data);
    var work = Promise.all(list.map(function (f) { return files.extractFileText(f); })).then(function (texts) {
      var found = {};
      texts.forEach(function (t) {
        if (t) sensitive(t, { bare: false }, true).forEach(function (k) { found[k] = true; });
      });
      return order.filter(function (k) { return found[k]; });
    });
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve([]); }, FILE_CHECK_MS); });
    return Promise.race([work, timeout]).catch(function () { return []; });
  }

  /**
   * Holds back files before the page gets them, checks them, and then either
   * hands them over (`release`) or asks first. `undo` tidies up if they don't
   * go in. Returns false, leaving the event alone, when there's nothing to check.
   */
  function interceptFiles(e, list, release, undo) {
    if (!files || !active()) return false;
    if (!list.some(files.canCheck)) return false;
    e.preventDefault();
    e.stopImmediatePropagation();
    checkFiles(list.filter(files.canCheck)).then(function (kinds) {
      if (!kinds.length) return withBypass(release);
      ask(kinds, "file", function (outcome) {
        if (outcome === "not_sensitive_blocked") outcome = "not_sensitive";
        else if (outcome === "sent_anyway" || outcome === "not_sensitive") withBypass(release);
        else if (undo) withBypass(undo);
        report(kinds, outcome, "file");
      }, false);
    });
    return true;
  }

  // File pickers. "input" comes just before "change"; both are held back and
  // replayed together. The input is emptied meanwhile so a form can't send it.
  function onFilePicked(e) {
    var input = e.target;
    if (bypass || !input || input.tagName !== "INPUT" || input.type !== "file") return;
    var list = fileList(input.files);
    if (!list.length || !files || !active() || !list.some(files.canCheck)) return;
    if (e.type === "input") {
      e.stopImmediatePropagation();
      return;
    }
    interceptFiles(e, list, function () {
      input.files = transferOf(list).files;
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    input.value = "";
  }
  window.addEventListener("input", onFilePicked, true);
  window.addEventListener("change", onFilePicked, true);

  window.addEventListener("paste", function (e) {
    if (bypass) return;
    var cd = e.clipboardData;
    var list = fileList(cd && cd.files);
    var target = editableFrom(e.target) || e.target;
    if (list.length && interceptFiles(e, list, function () {
      target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transferOf(list), bubbles: true, cancelable: true }));
    })) return;
    intercept(e, cd && cd.getData("text/plain"), "paste");
  }, true);

  window.addEventListener("drop", function (e) {
    if (bypass) return;
    var dt = e.dataTransfer;
    var list = fileList(dt && dt.files);
    // The browser empties dataTransfer once the event ends, so keep what we need now.
    var target = e.target;
    var where = { bubbles: true, cancelable: true, composed: true, clientX: e.clientX, clientY: e.clientY };
    if (list.length && interceptFiles(e, list, function () {
      where.dataTransfer = transferOf(list);
      target.dispatchEvent(new DragEvent("drop", where));
    }, function () {
      // Let the page clear any "drop here" overlay.
      target.dispatchEvent(new DragEvent("dragleave", { bubbles: true, composed: true, clientX: where.clientX, clientY: where.clientY }));
    })) return;
    intercept(e, dt && dt.getData("text/plain"), "drop");
  }, true);

  /* ── Sending typed messages (Enter or a Send button) ── */

  document.addEventListener("focusin", function (e) {
    var el = editableFrom(e.target);
    if (el) lastEditable = el;
  }, true);

  // Replaces what's in the message box, in a way editors (React, rich text) notice.
  function replaceText(composer, text) {
    composer.focus();
    if (composer.tagName === "TEXTAREA" || composer.tagName === "INPUT") {
      var proto = composer.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(composer, text);
      composer.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    var range = document.createRange();
    range.selectNodeContents(composer);
    deliver(composer, range, text);
  }

  function checkSend(e, composer, resend) {
    if (bypass || !active() || !composer) return;
    var text = textOf(composer);
    if (!text.trim()) return;
    if (allowOnce !== null && allowOnce === text) {
      allowOnce = null;
      return;
    }
    var options = { bare: false };
    var kinds = sensitive(text, options);
    if (!kinds.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var safe = hidden(text, options);
    ask(kinds, "send", function (outcome) {
      if (outcome === "not_sensitive_blocked") outcome = "not_sensitive";
      else if (outcome === "sent_anyway" || outcome === "not_sensitive") {
        allowOnce = text;
        composer.focus();
        resend();
      } else if (outcome === "masked") {
        replaceText(composer, safe);
        // Give the editor a moment to take the new text, and only send once the
        // box really holds the hidden version; otherwise leave it for the person.
        setTimeout(function () {
          if (sensitive(textOf(composer), options, true).length) return report(kinds, "stopped", "typed");
          composer.focus();
          resend();
          report(kinds, "masked", "typed");
        }, 60);
        return;
      } else composer.focus();
      report(kinds, outcome, "typed");
    }, safe !== null);
  }

  window.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.altKey) return;
    if (EVERYDAY && !e.ctrlKey && !e.metaKey) return; // in email, Enter is a new line; Ctrl+Enter sends
    var composer = editableFrom(e.target);
    if (!composer || composer.tagName === "INPUT") return;
    checkSend(e, composer, function () {
      composer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, ctrlKey: e.ctrlKey, metaKey: e.metaKey, bubbles: true, cancelable: true }));
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
