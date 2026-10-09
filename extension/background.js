/*
 * HighPre background worker: checks in with HighPre for the organisation's
 * policy and reports detections. A report is the kind of data, the app, the
 * time and what the person chose. Never the text.
 *
 * It also counts, here in the browser, on which days each AI tool was opened
 * (just the tool and the date: no pages, times or chats), and sends finished
 * days once a day so owners can see company totals. Owners can turn this off.
 */
importScripts("config.js", "catalog.js");

var CFG = self.HIGHPRE_CONFIG;
var CATALOG = self.HIGHPRE_CATALOG;
var VERSION = chrome.runtime.getManifest().version;
var OUTCOMES = ["stopped", "blocked", "sent_anyway", "not_sensitive", "masked"]; // "masked": sent with details hidden (Engineer A)
var AI_APPS = CATALOG.ai || [];
var USAGE_DAYS = 14; // most days kept, and sent at once

function deviceName() {
  var ua = navigator.userAgentData;
  var brand = "Browser";
  if (ua && ua.brands) {
    var names = ua.brands.map(function (b) { return b.brand; });
    brand = names.indexOf("Microsoft Edge") >= 0 ? "Edge" : names.indexOf("Google Chrome") >= 0 ? "Chrome" : names.indexOf("Brave") >= 0 ? "Brave" : "Chromium";
  }
  var platform = (ua && ua.platform) || "";
  return { hostname: platform ? brand + " on " + platform : brand, osVersion: platform || "Unknown" };
}

function post(path, body) {
  return fetch(CFG.apiUrl + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + CFG.token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(function (res) {
    if (res.status === 401 || res.status === 410) return removed().then(function () { throw new Error("removed"); });
    if (!res.ok) throw new Error("HighPre returned " + res.status);
    return res.json();
  });
}

// The organisation removed this browser: stop, clear what's stored, and uninstall.
function removed() {
  // Not the person's choice, so don't report it as "removed by the user".
  setUninstallUrl(false);
  return chrome.storage.local.set({ status: "removed", queue: [], usage: {} }).then(function () {
    try {
      chrome.management.uninstallSelf();
    } catch {
      // Uninstalling needs a user gesture in some browsers; the popup explains instead.
    }
  });
}

function heartbeat() {
  var d = deviceName();
  return post("/api/agent/heartbeat", { hostname: d.hostname, osVersion: d.osVersion, agentVersion: VERSION })
    .then(function (reply) {
      return chrome.storage.local.set({ policy: reply.policy || null, status: "connected", lastCheckIn: new Date().toISOString() });
    })
    .then(sendUsage)
    .catch(function () {});
}

/* ── AI tools used: one local record of {day: [app keys]}, sent once a day ── */

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

// The browser's local date, YYYY-MM-DD.
function today() {
  var d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function sharing(policy) {
  return !(policy && policy.shareAiUsage === false);
}

// Storage reads and writes for the usage record run one at a time, so two tabs
// opening together can't overwrite each other.
var usageChain = Promise.resolve();
function withUsage(fn) {
  usageChain = usageChain.then(fn, fn).catch(function () {});
  return usageChain;
}

function recordSeen(app) {
  return withUsage(function () {
    return chrome.storage.local.get(["usage", "policy", "status"]).then(function (v) {
      if (v.status === "removed" || !sharing(v.policy)) return;
      var usage = v.usage || {};
      var day = today();
      var apps = usage[day] || [];
      if (apps.indexOf(app) >= 0) return;
      usage[day] = apps.concat(app);
      // Keep only the most recent days.
      Object.keys(usage).sort().slice(0, -USAGE_DAYS).forEach(function (d) { delete usage[d]; });
      return chrome.storage.local.set({ usage: usage });
    });
  });
}

// Sends finished days not yet sent, at most once a day. Today is sent tomorrow.
function sendUsage() {
  return withUsage(function () {
    return chrome.storage.local.get(["usage", "usageSentOn", "policy", "status"]).then(function (v) {
      if (v.status === "removed") return;
      if (!sharing(v.policy)) return chrome.storage.local.set({ usage: {} });
      var day = today();
      if (v.usageSentOn === day) return;
      var usage = v.usage || {};
      var done = Object.keys(usage).filter(function (d) { return d < day; }).sort().slice(-USAGE_DAYS);
      if (!done.length) return;
      var days = done.map(function (d) { return { day: d, apps: usage[d] }; });
      return post("/api/agent/usage", { days: days }).then(function () {
        return chrome.storage.local.get("usage").then(function (now) {
          var left = now.usage || {};
          done.forEach(function (d) { delete left[d]; });
          return chrome.storage.local.set({ usage: left, usageSentOn: day });
        });
      });
    });
  });
}

// When the person removes the extension, the browser opens a HighPre page that
// records it, so owners can see the gap. Turned off when the organisation removes it.
function setUninstallUrl(on) {
  try {
    chrome.runtime.setUninstallURL(on && CFG.uninstallKey ? CFG.apiUrl + "/api/agent/goodbye?k=" + encodeURIComponent(CFG.uninstallKey) : "");
  } catch {
    // Older browsers: nothing to set.
  }
}

function flush() {
  return chrome.storage.local.get(["queue", "status"]).then(function (v) {
    var queue = v.queue || [];
    if (!queue.length || v.status === "removed") return;
    var batch = queue.slice(0, 50);
    return post("/api/agent/alerts", { events: batch }).then(function () {
      return chrome.storage.local.get("queue").then(function (now) {
        return chrome.storage.local.set({ queue: (now.queue || []).slice(batch.length) });
      });
    });
  }).catch(function () {});
}

function start() {
  chrome.storage.local.set({ orgName: CFG.orgName });
  chrome.storage.local.get("status").then(function (v) { setUninstallUrl(v.status !== "removed"); });
  chrome.alarms.create("heartbeat", { periodInMinutes: 15 });
  chrome.alarms.create("flush", { periodInMinutes: 1 });
  heartbeat().then(flush);
}

chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === "heartbeat") heartbeat();
  else flush();
});

chrome.runtime.onMessage.addListener(function (msg, sender) {
  // Only content scripts in tabs can report, and only known keys are accepted.
  if (!sender.tab || !msg) return;
  if (msg.type === "seen") {
    // Counted only when the sending page really is that AI tool's site.
    var host = "";
    try {
      host = new URL(sender.url).hostname;
    } catch {
      return;
    }
    if (AI_APPS.indexOf(msg.app) >= 0 && CATALOG.sites[host] === msg.app) recordSeen(msg.app);
    return;
  }
  if (msg.type !== "detection") return;
  if (!CATALOG.apps[msg.app] || OUTCOMES.indexOf(msg.outcome) < 0 || !Array.isArray(msg.kinds)) return;
  var at = new Date().toISOString();
  var events = msg.kinds
    .filter(function (k) { return Object.prototype.hasOwnProperty.call(CATALOG.data, k); })
    .map(function (k) { return { dataType: k, app: msg.app, occurredAt: at, source: "extension", outcome: msg.outcome, via: ["paste", "typed", "drop", "file"].indexOf(msg.via) >= 0 ? msg.via : undefined }; }); // via: how it was on its way out (Engineer A)
  if (!events.length) return;
  chrome.storage.local.get("queue").then(function (v) {
    var queue = (v.queue || []).concat(events).slice(-200);
    return chrome.storage.local.set({ queue: queue });
  }).then(flush);
});
