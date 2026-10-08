(function () {
  "use strict";
  var catalog = self.HIGHPRE_CATALOG;
  chrome.storage.local.get(["orgName", "status", "lastCheckIn", "policy"], function (v) {
    document.getElementById("org").textContent = v.orgName ? "Protecting " + v.orgName : "";
    var dot = document.getElementById("dot");
    var status = document.getElementById("status");
    if (v.status === "removed") {
      dot.className = "dot off";
      status.textContent = "Removed by your organisation. You can uninstall this extension.";
    } else if (v.status === "connected") {
      dot.className = "dot";
      status.textContent = "On" + (v.lastCheckIn ? " · checked in " + new Date(v.lastCheckIn).toLocaleTimeString() : "");
    } else {
      status.textContent = "Waiting to connect to HighPre";
    }
    var allowed = (v.policy && v.policy.allowedApps) || [];
    var watched = Object.keys(catalog.apps).filter(function (k) { return allowed.indexOf(k) < 0; });
    document.getElementById("sites").textContent = "Watching: " + watched.map(function (k) { return catalog.apps[k]; }).join(", ") + ".";
  });
})();
