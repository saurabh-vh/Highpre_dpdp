/*!
 * HighPre form consent
 *
 * Adds consent checkboxes to the website's own forms (contact, enquiry,
 * sign-up) and records each submission in the consent ledger.
 *
 * - <form data-hp-consent="marketing,updates"> gets one checkbox per purpose.
 *   An empty value uses the purposes chosen in the dashboard; "off" opts out.
 * - <form data-hp-required="marketing"> overrides which boxes must be ticked
 *   ("*" for all, "" for none). Otherwise the dashboard setting applies.
 * - With "Protect forms automatically" on, any form asking for an email,
 *   phone number or name gets the dashboard's form purposes (never search,
 *   login or password forms).
 * - Boxes are never pre-ticked. A missing required box blocks the submit with
 *   an inline message; otherwise the site's own submission carries on untouched.
 * - A hidden "hp_consent_id" field carries the ledger receipt id to the
 *   site's backend, so the lead can be stored with its proof of consent.
 *
 * The block lives in the page (not a shadow root) so the hidden field submits
 * with the form; it inherits the site's font and uses namespaced classes.
 */

var MAX_FORM_ID = 100;
var SKIP_TYPES = ["hidden", "submit", "button", "reset", "image", "checkbox", "radio", "file", "range", "color", "date", "number"];
var SEARCH_NAMES = ["q", "s", "query", "search", "keyword", "keywords"];

// ── Pure helpers (unit-tested in tests/forms.test.ts) ────────────────

/** "a, b,,c" -> ["a", "b", "c"] (deduplicated). */
export function splitKeys(value) {
  var out = [];
  String(value || "")
    .split(",")
    .forEach(function (k) {
      k = k.trim();
      if (k && out.indexOf(k) < 0) out.push(k);
    });
  return out;
}

/** What personal data a field asks for: "email", "tel", "name" or null. */
export function fieldKind(f) {
  var type = String(f.type || "").toLowerCase();
  if (SKIP_TYPES.indexOf(type) >= 0 || type === "password" || type === "search") return null;
  if (type === "email") return "email";
  if (type === "tel") return "tel";
  var sig = [f.name, f.id, f.placeholder, f.autocomplete, f.ariaLabel].filter(Boolean).join(" ").toLowerCase();
  if (/e-?mail/.test(sig)) return "email";
  if (/phone|mobile|whatsapp|(^|[^a-z])tel([^a-z]|$)|contact.?(no|num)/.test(sig)) return "tel";
  if (/user.?name|login|company|business|organi[sz]ation|file.?name|domain|product|coupon/.test(sig)) return null;
  if (/(^|[^a-z])((full|first|last|given|family|your)[ _-]?)?name([^a-z]|$)|given-name|family-name|fname|lname/.test(sig)) return "name";
  return null;
}

/** Search, login and password forms never get consent boxes automatically. */
export function isExcludedForm(form) {
  var fields = form.fields || [];
  for (var i = 0; i < fields.length; i++) {
    var type = String(fields[i].type || "").toLowerCase();
    if (type === "password" || type === "search") return true;
  }
  if (String(form.role || "").toLowerCase() === "search") return true;
  var sig = [form.id, form.name, form.className, form.action].filter(Boolean).join(" ").toLowerCase();
  if (/search|log.?in|sign.?in|password|passwd/.test(sig)) return true;
  // A lone "q" / "s" box is a site search, whatever it's called.
  var typed = fields.filter(function (f) {
    return SKIP_TYPES.indexOf(String(f.type || "").toLowerCase()) < 0;
  });
  return typed.length === 1 && SEARCH_NAMES.indexOf(String(typed[0].name || "").toLowerCase()) >= 0;
}

/** True when automatic protection should add consent boxes to this form. */
export function isAutoEligible(form) {
  if (isExcludedForm(form)) return false;
  return (form.fields || []).some(function (f) {
    return fieldKind(f) !== null;
  });
}

/** Stable label for a form in the ledger: id, else name, else the action's path. */
export function formIdentifier(form, base) {
  var id = form.id || form.name;
  if (!id && form.action) {
    try {
      id = new URL(form.action, base).pathname;
    } catch (e) {
      id = form.action;
    }
  }
  if (!id && base) {
    try {
      id = new URL(base).pathname;
    } catch (e) {
      /* fall through */
    }
  }
  return String(id || "form").trim().slice(0, MAX_FORM_ID) || "form";
}

/**
 * The purposes to show on a form, with whether each is required.
 * spec: { consent: attribute value or null, required: attribute value or null, auto: boolean }
 * config: the widget config ({ purposes, forms: { purposes, required } }).
 * Only purposes in the published notice are ever shown.
 */
export function resolvePurposes(spec, config) {
  var forms = config.forms || {};
  var known = {};
  (config.purposes || []).forEach(function (p) {
    known[p.key] = true;
  });
  var keys;
  if (spec.consent != null) {
    if (/^\s*(off|none|false)\s*$/i.test(spec.consent)) return [];
    keys = splitKeys(spec.consent);
    if (!keys.length) keys = forms.purposes || [];
  } else if (spec.auto) {
    keys = forms.purposes || [];
  } else {
    return [];
  }
  var all = spec.required != null && /^\s*(\*|all|true)\s*$/i.test(spec.required);
  var required = spec.required != null ? splitKeys(spec.required) : forms.required || [];
  return splitKeys(keys.join(","))
    .filter(function (k) {
      return known[k];
    })
    .map(function (k) {
      return { key: k, required: all || required.indexOf(k) >= 0 };
    });
}

/** Keys of required purposes the visitor hasn't ticked. */
export function missingRequired(purposes, checked) {
  return purposes
    .filter(function (p) {
      return p.required && !checked[p.key];
    })
    .map(function (p) {
      return p.key;
    });
}

/** RFC 4122 version 4 UUID (randomUUID needs a secure context, so fall back). */
export function uuid(c) {
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  var b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  var h = "";
  for (var i = 0; i < 16; i++) {
    h += (b[i] + 0x100).toString(16).slice(1);
    if (i === 3 || i === 5 || i === 7 || i === 9) h += "-";
  }
  return h;
}

/** The consent ledger entry for one form submission. */
export function formPayload(o) {
  return {
    siteKey: o.siteKey,
    principalId: o.principalId,
    action: "grant",
    noticeVersion: o.version,
    decisions: o.purposes.map(function (p) {
      return { purpose: p.key, granted: !!o.checked[p.key] };
    }),
    language: o.lang,
    pageUrl: o.pageUrl,
    source: "form",
    formId: o.formId,
    receiptId: o.receiptId,
  };
}

// ── DOM ──────────────────────────────────────────────────────────────

var STYLE =
  ".hp-consent{margin:12px 0;font:inherit;color:inherit}" +
  ".hp-consent__legend{margin:0 0 6px;font-size:.9em;line-height:1.4}" +
  ".hp-consent__item{margin:4px 0}" +
  ".hp-consent label.hp-consent__label{display:flex;gap:8px;align-items:flex-start;margin:0;font:inherit;font-size:.9em;font-weight:inherit;line-height:1.4;cursor:pointer;text-transform:none;letter-spacing:normal}" +
  ".hp-consent input.hp-consent__box{position:static;flex:none;width:auto;height:auto;min-height:0;margin:.2em 0 0;padding:0;opacity:1;-webkit-appearance:checkbox;appearance:auto;cursor:pointer}" +
  ".hp-consent__tag{opacity:.7}" +
  ".hp-consent a.hp-consent__notice{font-size:.85em;color:inherit;text-decoration:underline}" +
  ".hp-consent__error{margin:6px 0 0;font-size:.85em;font-weight:600;color:#c62828}" +
  ".hp-consent--invalid input.hp-consent__box[aria-invalid=true]{outline:2px solid #c62828;outline-offset:2px}" +
  ".hp-consent [hidden]{display:none!important}";

var FALLBACK = {
  formLegend: "I agree that my details may be used for:",
  formRequired: "required",
  formOptional: "optional",
  formError: "Please tick the required consent box to continue.",
  notice: "Read notice",
};

function describeForm(form) {
  var fields = [];
  var inputs = form.querySelectorAll("input, textarea, select");
  for (var i = 0; i < inputs.length; i++) {
    var el = inputs[i];
    // getAttribute, not properties: a field named "name" or "id" shadows form.name / form.id.
    fields.push({
      type: el.tagName === "INPUT" ? el.getAttribute("type") || "text" : el.tagName.toLowerCase(),
      name: el.getAttribute("name"),
      id: el.getAttribute("id"),
      placeholder: el.getAttribute("placeholder"),
      autocomplete: el.getAttribute("autocomplete"),
      ariaLabel: el.getAttribute("aria-label"),
    });
  }
  return {
    id: form.getAttribute("id"),
    name: form.getAttribute("name"),
    action: form.getAttribute("action"),
    role: form.getAttribute("role"),
    className: form.getAttribute("class"),
    fields: fields,
  };
}

function node(tag, attrs, text) {
  var n = document.createElement(tag);
  for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
  if (text) n.textContent = text;
  return n;
}

/** Just before the submit button, or before its only-child wrapper so flex rows stay intact. */
function insertionPoint(form) {
  var btn = form.querySelector('button[type="submit"], input[type="submit"], input[type="image"], button:not([type])');
  if (!btn) return null;
  var anchor = btn;
  while (anchor.parentNode && anchor.parentNode !== form && anchor.parentNode.children.length === 1) anchor = anchor.parentNode;
  return anchor;
}

/**
 * Starts form protection. Called by widget.js once the config is loaded.
 * ctx: { config, siteKey, api, lang: () => code, principalId: () => id }
 */
export function initForms(ctx) {
  var config = ctx.config;
  if (!config || !config.ready || !config.purposes || !config.purposes.length || typeof WeakMap !== "function") return;
  var entries = new WeakMap();
  var seq = 0;
  var styled = false;

  function strings(lang) {
    var s = (config.strings && (config.strings[lang] || config.strings.en)) || {};
    var out = {};
    for (var k in FALLBACK) out[k] = s[k] || FALLBACK[k];
    return out;
  }

  function addStyle() {
    if (styled) return;
    styled = true;
    var style = node("style", { "data-hp-consent-style": "" }, STYLE);
    (document.head || document.documentElement).appendChild(style);
  }

  function protect(form) {
    if (entries.has(form) || form.querySelector(".hp-consent")) return;
    var desc = describeForm(form);
    var consentAttr = form.getAttribute("data-hp-consent");
    var auto = consentAttr === null && !!(config.forms && config.forms.auto) && isAutoEligible(desc);
    var purposes = resolvePurposes({ consent: consentAttr, required: form.getAttribute("data-hp-required"), auto: auto }, config);
    if (!purposes.length) return;

    addStyle();
    var lang = ctx.lang();
    var s = strings(lang);
    var n = ++seq;
    var legendId = "hp-consent-legend-" + n;
    var errorId = "hp-consent-error-" + n;
    var block = node("div", { class: "hp-consent", role: "group", "aria-labelledby": legendId, lang: lang, "data-hp-consent-block": "" });
    block.appendChild(node("p", { class: "hp-consent__legend", id: legendId }, s.formLegend));

    var byKey = {};
    config.purposes.forEach(function (p) {
      byKey[p.key] = p;
    });
    var boxes = [];
    purposes.forEach(function (p, i) {
      var info = (byKey[p.key].text && (byKey[p.key].text[lang] || byKey[p.key].text.en)) || { name: p.key };
      var id = "hp-consent-" + n + "-" + i;
      // No name attribute: only hp_consent_id reaches the site's backend.
      var box = node("input", { type: "checkbox", id: id, class: "hp-consent__box", "data-hp-key": p.key });
      if (p.required) box.setAttribute("aria-required", "true");
      box.checked = false;
      var label = node("label", { for: id, class: "hp-consent__label" });
      label.appendChild(box);
      var span = node("span", info.description ? { title: info.description } : {}, info.name + " ");
      span.appendChild(node("span", { class: "hp-consent__tag" }, "(" + (p.required ? s.formRequired : s.formOptional) + ")"));
      label.appendChild(span);
      var item = node("div", { class: "hp-consent__item" });
      item.appendChild(label);
      block.appendChild(item);
      boxes.push(box);
      box.addEventListener("change", function () {
        if (box.checked) box.removeAttribute("aria-invalid");
        if (!block.querySelector('[aria-invalid="true"]')) {
          error.hidden = true;
          block.className = "hp-consent";
        }
      });
    });

    block.appendChild(node("a", { class: "hp-consent__notice", href: config.noticeUrl + "?lang=" + lang, target: "_blank", rel: "noopener" }, s.notice));
    var error = node("p", { class: "hp-consent__error", id: errorId, role: "alert" }, s.formError);
    error.hidden = true;
    block.appendChild(error);
    var hidden = node("input", { type: "hidden", name: "hp_consent_id", value: "" });
    block.appendChild(hidden);
    boxes.forEach(function (b) {
      b.setAttribute("aria-describedby", errorId);
    });

    var at = insertionPoint(form);
    if (at) at.parentNode.insertBefore(block, at);
    else form.appendChild(block);
    form.setAttribute("data-hp-protected", "");
    entries.set(form, { purposes: purposes, boxes: boxes, hidden: hidden, error: error, block: block, lang: lang, desc: desc });
  }

  function scan() {
    var forms = document.querySelectorAll("form");
    for (var i = 0; i < forms.length; i++) protect(forms[i]);
  }

  // Capture on document so this runs before the site's own submit handlers.
  document.addEventListener(
    "submit",
    function (e) {
      var form = e.target;
      var entry = form && entries.get(form);
      if (!entry || !entry.block.isConnected) return;
      var checked = {};
      entry.boxes.forEach(function (b) {
        checked[b.getAttribute("data-hp-key")] = b.checked;
      });
      var missing = missingRequired(entry.purposes, checked);
      if (missing.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        var first = null;
        entry.boxes.forEach(function (b) {
          var bad = missing.indexOf(b.getAttribute("data-hp-key")) >= 0;
          if (bad) b.setAttribute("aria-invalid", "true");
          if (bad && !first) first = b;
        });
        entry.block.className = "hp-consent hp-consent--invalid";
        entry.error.hidden = false;
        if (first) first.focus();
        return;
      }
      entry.error.hidden = true;

      // A fresh receipt per submission, set before the site's handlers read the form.
      var receiptId = uuid(window.crypto || window.msCrypto);
      entry.hidden.value = receiptId;
      var payload = formPayload({
        siteKey: ctx.siteKey,
        principalId: ctx.principalId(),
        version: config.version,
        purposes: entry.purposes,
        checked: checked,
        lang: entry.lang,
        pageUrl: location.origin + location.pathname,
        formId: formIdentifier(entry.desc, location.href),
        receiptId: receiptId,
      });
      send(ctx.api + "/api/public/consent", JSON.stringify(payload));
      try {
        window.dispatchEvent(new CustomEvent("highpre:form-consent", { detail: { formId: payload.formId, receiptId: receiptId, decisions: payload.decisions } }));
      } catch (err) {
        /* old browsers without CustomEvent: recording still happened */
      }
    },
    true,
  );

  scan();
  if (window.MutationObserver && document.body) {
    var timer = null;
    new MutationObserver(function () {
      if (timer) return;
      timer = setTimeout(function () {
        timer = null;
        scan();
      }, 250);
    }).observe(document.body, { childList: true, subtree: true });
  }
}

/** Never blocks or delays the site's submission: a beacon survives page navigation. */
function send(url, body) {
  try {
    // text/plain is CORS-safelisted, so neither path needs a preflight.
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }))) return;
  } catch (e) {
    /* fall back to fetch */
  }
  try {
    fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: body, keepalive: true }).catch(function () {});
  } catch (e) {
    /* recording is best effort; the site's form must still work */
  }
}
