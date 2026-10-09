package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// AI tools report: which AI apps were in the foreground on which days. Only
// the app key and the local date are kept, never window titles, times or how
// long. Owners see company totals (how many people use each tool).
// Keep in sync with the "ai" apps in src/lib/agent/catalog.ts.
var aiAppKeys = map[string]bool{
	"chatgpt": true, "claude": true, "gemini": true, "copilot": true, "perplexity": true,
	"deepseek": true, "meta_ai": true, "grok": true, "mistral": true, "notebooklm": true, "poe": true,
}

const usageMaxDays = 14 // days kept on disk, and the most sent at once

// UsageDay is one day of the report: the date and the AI apps seen. Nothing else.
type UsageDay struct {
	Day  string   `json:"day"`
	Apps []string `json:"apps"`
}

type usageLog struct {
	mu     sync.Mutex
	file   string
	Days   map[string][]string `json:"days"`
	SentOn string              `json:"sentOn"` // local date of the last successful send
}

func usagePath() string { return filepath.Join(dataDir(), "usage.json") }

func loadUsage() *usageLog {
	u := &usageLog{file: usagePath(), Days: map[string][]string{}}
	if data, err := os.ReadFile(u.file); err == nil {
		_ = json.Unmarshal(data, u)
		if u.Days == nil {
			u.Days = map[string][]string{}
		}
	}
	return u
}

// record notes that an AI app was in front on the given local day. Other apps are ignored.
func (u *usageLog) record(app string, now time.Time) {
	if !aiAppKeys[app] {
		return
	}
	day := now.Format("2006-01-02")
	u.mu.Lock()
	defer u.mu.Unlock()
	for _, a := range u.Days[day] {
		if a == app {
			return
		}
	}
	u.Days[day] = append(u.Days[day], app)
	days := u.sortedDays()
	for len(days) > usageMaxDays {
		delete(u.Days, days[0])
		days = days[1:]
	}
	u.persist()
}

func (u *usageLog) sortedDays() []string {
	days := make([]string, 0, len(u.Days))
	for d := range u.Days {
		days = append(days, d)
	}
	sort.Strings(days)
	return days
}

// due returns finished days (before today) to send, or nil if already sent today.
func (u *usageLog) due(now time.Time) []UsageDay {
	today := now.Format("2006-01-02")
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.SentOn == today {
		return nil
	}
	var out []UsageDay
	for _, d := range u.sortedDays() {
		if d < today {
			out = append(out, UsageDay{Day: d, Apps: append([]string(nil), u.Days[d]...)})
		}
	}
	if len(out) > usageMaxDays {
		out = out[len(out)-usageMaxDays:]
	}
	return out
}

// sent forgets days the server has accepted.
func (u *usageLog) sent(days []UsageDay, now time.Time) {
	u.mu.Lock()
	defer u.mu.Unlock()
	for _, d := range days {
		delete(u.Days, d.Day)
	}
	u.SentOn = now.Format("2006-01-02")
	u.persist()
}

// clear drops everything, for when the organisation turns the report off.
func (u *usageLog) clear() {
	u.mu.Lock()
	defer u.mu.Unlock()
	if len(u.Days) == 0 {
		return
	}
	u.Days = map[string][]string{}
	u.persist()
}

func (u *usageLog) persist() {
	data, _ := json.Marshal(u)
	_ = os.MkdirAll(filepath.Dir(u.file), 0o700)
	_ = os.WriteFile(u.file, data, 0o600)
}
