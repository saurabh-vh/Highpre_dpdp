package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	pollEvery      = 700 * time.Millisecond
	watchFor       = 2 * time.Minute  // how long sensitive clipboard content stays "live"
	flushEvery     = 30 * time.Second // send queued detections
	heartbeatEvery = 15 * time.Minute
	updateEvery    = 6 * time.Hour
)

// Platform hooks, swappable in tests.
var (
	clipChanged = clipboardChanged
	clipRead    = readClipboard
	fgWindow    = foregroundWindow
	notifyUser  = notify
	applyUpd    = applyUpdate
)

type monitor struct {
	api *client
	// policy comes from the dashboard with each heartbeat; nil means watch everything.
	policy *Policy
	// pending is set while the clipboard holds sensitive data. Only the data
	// types are kept; the text itself is dropped right after Detect.
	pending      []string
	pendingSince time.Time
	clipVersion  uint64
	alerted      map[string]bool // app keys already alerted for the current clipboard content
}

func policyPath() string { return filepath.Join(dataDir(), "policy.json") }

func newMonitor(cfg Config) *monitor {
	m := &monitor{api: newClient(cfg), alerted: map[string]bool{}}
	// The last policy received applies until the server can be reached again.
	if data, err := os.ReadFile(policyPath()); err == nil {
		var p Policy
		if json.Unmarshal(data, &p) == nil {
			m.policy = &p
		}
	}
	return m
}

func (m *monitor) loop() {
	m.sendHeartbeat()
	m.update()
	lastFlush, lastBeat, lastUpdate := time.Now(), time.Now(), time.Now()
	for {
		m.tick()
		if time.Since(lastFlush) > flushEvery {
			lastFlush = time.Now()
			m.check(m.api.flush())
		}
		if time.Since(lastBeat) > heartbeatEvery {
			lastBeat = time.Now()
			if m.sendHeartbeat() {
				lastUpdate = time.Time{} // the server has a newer version: check now
			}
		}
		if time.Since(lastUpdate) > updateEvery {
			lastUpdate = time.Now()
			m.update()
		}
		time.Sleep(pollEvery)
	}
}

func (m *monitor) tick() {
	if v, changed := clipChanged(m.clipVersion); changed {
		m.clipVersion = v
		m.alerted = map[string]bool{}
		m.pending = nil
		if text, err := clipRead(); err == nil {
			if kinds := m.watched(Detect(text)); len(kinds) > 0 {
				m.pending, m.pendingSince = kinds, time.Now()
			}
		}
	}
	if m.pending == nil {
		return
	}
	if time.Since(m.pendingSince) > watchFor {
		m.pending = nil
		return
	}
	// Only look at the foreground window while sensitive data is on the clipboard.
	process, title := fgWindow()
	app := ClassifyApp(process, title)
	if app == "" || m.alerted[app] || m.approved(app) {
		return
	}
	m.alerted[app] = true
	now := time.Now().UTC()
	for _, kind := range m.pending {
		m.api.enqueue(Event{DataType: kind, App: app, OccurredAt: now})
	}
	notifyUser("Careful: sensitive data on your clipboard",
		"You've copied "+describe(m.pending)+" and "+appLabels[app]+" is open. Please don't paste it there. "+
			"Your organisation's owners will be told this happened; what you copied stays on this computer.")
	m.check(m.api.flush())
}

// watched keeps the kinds of data the organisation asked to watch for.
func (m *monitor) watched(kinds []string) []string {
	if m.policy == nil || len(kinds) == 0 {
		return kinds
	}
	var out []string
	for _, k := range kinds {
		for _, w := range m.policy.DataTypes {
			if k == w {
				out = append(out, k)
				break
			}
		}
	}
	return out
}

// approved is true for apps the organisation has approved, such as a company ChatGPT workspace.
func (m *monitor) approved(app string) bool {
	if m.policy == nil {
		return false
	}
	for _, a := range m.policy.AllowedApps {
		if a == app {
			return true
		}
	}
	return false
}

// sendHeartbeat checks in, applies the latest policy, and reports whether a newer agent is available.
func (m *monitor) sendHeartbeat() bool {
	reply, err := m.api.heartbeat()
	m.check(err)
	if err != nil {
		return false
	}
	if reply.Policy != nil {
		m.policy = reply.Policy
		if data, err := json.Marshal(reply.Policy); err == nil {
			_ = os.MkdirAll(dataDir(), 0o700)
			_ = os.WriteFile(policyPath(), data, 0o600)
		}
	}
	return reply.LatestVersion != "" && newerVersion(reply.LatestVersion, Version)
}

// update installs a verified newer version and restarts into it.
func (m *monitor) update() {
	staged, err := m.api.checkForUpdate()
	m.check(err)
	if staged == "" {
		return
	}
	_ = m.api.flush()
	if err := applyUpd(staged); err != nil {
		_ = os.Remove(staged)
	}
}

// check stops the agent for good when the organisation has removed this device.
func (m *monitor) check(err error) {
	if !errors.Is(err, errRevoked) {
		return
	}
	notifyUser("HighPre Agent stopped", "Your organisation removed this computer from HighPre, so the agent has turned itself off.")
	uninstall()
	os.Exit(0)
}

func describe(kinds []string) string {
	labels := make([]string, 0, len(kinds))
	for _, k := range kinds {
		labels = append(labels, dataLabels[k])
	}
	if len(labels) == 1 {
		return labels[0]
	}
	return strings.Join(labels[:len(labels)-1], ", ") + " and " + labels[len(labels)-1]
}
