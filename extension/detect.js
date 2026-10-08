/*
 * HighPre detection for the browser extension: a line-for-line port of
 * agent/detect.go. Runs in the page's content script; text is inspected in
 * memory and never leaves the browser. Both detectors are tested against
 * agent/testdata/detect_cases.json.
 */
(function (root) {
  "use strict";

  var MAX_SCAN = 200000;

  var rePrivateKey = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/;
  var reAPIKeys = [
    /\bAKIA[0-9A-Z]{16}\b/, // AWS access key
    /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, // GitHub token
    /\bgithub_pat_[A-Za-z0-9_]{40,}\b/, // GitHub fine-grained token
    /\bsk_live_[0-9A-Za-z]{20,}\b/, // Stripe
    /\brzp_live_[A-Za-z0-9]{14,}\b/, // Razorpay
    /\bsk-ant-[A-Za-z0-9_-]{20,}/, // Anthropic
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/, // OpenAI
    /\bAIza[0-9A-Za-z_-]{35}\b/, // Google API key
    /\bxox[abprs]-[A-Za-z0-9-]{10,}/, // Slack
    /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT
    /\b(?:api[_-]?key|secret[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token)\b\s*["']?\s*[:=]\s*["']?[A-Za-z0-9_\-/+=.]{16,}/i,
  ];
  var rePasswordField = /(?:\bpassword|\bpasswd|\bpwd|\bpass\s*code|पासवर्ड)\s*["']?\s*[:=]\s*["']?\S{6,}/i;
  var reURLCreds = /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s:/@]{4,}@[^\s/]+/;
  var reCardCandidate = /\b(?:\d[ -]?){12,18}\d\b/g;
  var reAadhaar = /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g;
  var rePAN = /\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b/;
  var reIFSC = /\b[A-Z]{4}0[A-Z0-9]{6}\b/;
  var reAccountNumber = /\b\d{9,18}\b/;
  var reAccountLabel = /\b(?:a\/c|acct|account)\s*(?:no\.?|number|#)?\s*[:-]?\s*\d{9,18}\b/i;
  var rePassport = /\b[A-PR-WY][1-9]\d ?\d{4}[1-9]\b/;
  var rePassportLabel = /passport/i;
  var reEmail = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  var reIndianMobile = /(?:\+91[ -]?|\b0)?\b[6-9]\d{9}\b/g;

  function findAll(re, text, max) {
    re.lastIndex = 0;
    var out = [];
    var m;
    while (out.length < max && (m = re.exec(text)) !== null) {
      out.push(m[0]);
      if (m[0] === "") re.lastIndex++;
    }
    return out;
  }

  function digitsOnly(s) {
    return s.replace(/[^0-9]/g, "");
  }

  function luhn(d) {
    var sum = 0;
    var dbl = false;
    for (var i = d.length - 1; i >= 0; i--) {
      var n = d.charCodeAt(i) - 48;
      if (dbl) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      dbl = !dbl;
    }
    return sum % 10 === 0;
  }

  // Visa, Mastercard, Amex, Diners, Discover, JCB and RuPay ranges.
  var CARD_PREFIXES = ["4", "51", "52", "53", "54", "55", "2", "34", "37", "36", "38", "30", "6", "35", "81", "82", "508"];

  function hasCardNumber(text) {
    var found = findAll(reCardCandidate, text, 50);
    for (var i = 0; i < found.length; i++) {
      var d = digitsOnly(found[i]);
      if (d.length < 13 || d.length > 19 || !luhn(d)) continue;
      if (CARD_PREFIXES.some(function (p) { return d.indexOf(p) === 0; })) return true;
    }
    return false;
  }

  // Verhoeff checksum, used by Aadhaar numbers.
  var vD = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  var vP = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];

  function verhoeff(d) {
    var c = 0;
    for (var i = 0; i < d.length; i++) c = vD[c][vP[i % 8][d.charCodeAt(d.length - 1 - i) - 48]];
    return c === 0;
  }

  function hasAadhaar(text) {
    var found = findAll(reAadhaar, text, 50);
    for (var i = 0; i < found.length; i++) {
      var d = digitsOnly(found[i]);
      if (d.length === 12 && verhoeff(d)) return true;
    }
    return false;
  }

  // Phone numbers are compared by their last 10 digits; emails as written.
  function countDistinct(items) {
    var seen = {};
    items.forEach(function (s) {
      var key = s;
      if (s.indexOf("@") < 0) {
        key = digitsOnly(s);
        if (key.length > 10) key = key.slice(-10);
      }
      seen[key.toLowerCase()] = true;
    });
    return Object.keys(seen).length;
  }

  var reLower = /\p{Ll}/u;
  var reUpper = /\p{Lu}/u;
  var reDigit = /\p{Nd}/u;

  // A lone copied secret, as copied from a password manager: one token, 8–64
  // characters, mixing at least three character classes.
  function looksLikeBarePassword(text) {
    var t = text.trim();
    var bytes = new TextEncoder().encode(t).length;
    if (bytes < 8 || bytes > 64 || /[ \t\r\n]/.test(t) || t.indexOf("://") >= 0 || t.indexOf("@") >= 0) return false;
    var lower = false, upper = false, digit = false, symbol = false;
    for (var ch of t) {
      if (reLower.test(ch)) lower = true;
      else if (reUpper.test(ch)) upper = true;
      else if (reDigit.test(ch)) digit = true;
      else if (ch.charCodeAt(0) < 128) symbol = true;
      else return false; // non-ASCII text is a word, not a password
    }
    var classes = [lower, upper, digit, symbol].filter(Boolean).length;
    // Identifiers like "getUserName" or "Version2" mix classes too; require a symbol or 4 classes.
    return classes >= 3 && (symbol || classes === 4);
  }

  /**
   * Returns the kinds of sensitive data found in text, most serious first.
   * options.bare = false skips the lone-password check, for typed messages
   * where a single word like "Thanks2u!" is ordinary.
   */
  function detect(text, options) {
    var bare = !options || options.bare !== false;
    if (typeof text !== "string") return [];
    if (text.length > MAX_SCAN) text = text.slice(0, MAX_SCAN);
    if (text.trim() === "") return [];
    var found = [];

    if (rePrivateKey.test(text)) found.push("private_key");
    if (reAPIKeys.some(function (re) { return re.test(text); })) found.push("api_key");
    // A lone token counts as a password only if it isn't already a recognised key.
    if (rePasswordField.test(text) || reURLCreds.test(text) || (bare && found.length === 0 && looksLikeBarePassword(text))) found.push("password");
    if (hasCardNumber(text)) found.push("card_number");
    if ((reIFSC.test(text) && reAccountNumber.test(text)) || reAccountLabel.test(text)) found.push("bank_account");
    if (hasAadhaar(text)) found.push("aadhaar");
    if (rePAN.test(text)) found.push("pan");
    if (rePassportLabel.test(text) && rePassport.test(text)) found.push("passport");
    if (countDistinct(findAll(reEmail, text, 200)) >= 10 || countDistinct(findAll(reIndianMobile, text, 200)) >= 10) found.push("bulk_personal_data");
    return found;
  }

  root.HighPreDetect = { detect: detect };
  if (typeof module !== "undefined" && module.exports) module.exports = { detect: detect };
})(typeof self !== "undefined" ? self : globalThis);
