/*
 * HighPre background worker: checks in with HighPre for the organisation's
 * policy and reports detections. A report is the kind of data, the app, the
 * time and what the person chose. Never the text.
 */
importScripts("config.js", "catalog.js");

var CFG = self.HIGHPRE_CONFIG;
var CATALOG = self.HIGHPRE_CATALOG;
var VERSION = chrome.runtime.getManifest().version;
var OUTCOMES = ["stopped", "blocked", "sent_anyway", "not_sensitive"];

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
  return chrome.storage.local.set({ status: "removed", queue: [] }).then(function () {
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
    .catch(function () {});
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
  if (!sender.tab || !msg || msg.type !== "detection") return;
  if (!CATALOG.apps[msg.app] || OUTCOMES.indexOf(msg.outcome) < 0 || !Array.isArray(msg.kinds)) return;
  var at = new Date().toISOString();
  var events = msg.kinds
    .filter(function (k) { return Object.prototype.hasOwnProperty.call(CATALOG.data, k); })
    .map(function (k) { return { dataType: k, app: msg.app, occurredAt: at, source: "extension", outcome: msg.outcome }; });
  if (!events.length) return;
  chrome.storage.local.get("queue").then(function (v) {
    var queue = (v.queue || []).concat(events).slice(-200);
    return chrome.storage.local.set({ queue: queue });
  }).then(flush);
});
