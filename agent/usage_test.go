package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func setClock(t *testing.T, at time.Time) *time.Time {
	t.Helper()
	cur := at
	old := clock
	clock = func() time.Time { return cur }
	t.Cleanup(func() { clock = old })
	return &cur
}

func TestUsageReportsOnlyAIAppKeysAndDays(t *testing.T) {
	t.Setenv("LOCALAPPDATA", t.TempDir())
	t.Setenv("HOME", t.TempDir())

	var mu sync.Mutex
	var bodies []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		bodies = append(bodies, r.URL.Path+" "+string(b))
		mu.Unlock()
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	desk := &fakeDesktop{}
	desk.install(t)
	now := setClock(t, time.Date(2026, 10, 8, 10, 0, 0, 0, time.Local))
	m := newMonitor(Config{APIURL: srv.URL, Token: "hpa_test"})

	desk.process, desk.title = "chrome.exe", "ChatGPT - Q3 salary plan for Priya - Google Chrome"
	m.sampleUsage()
	m.sampleUsage()                                       // seen again the same day: still one entry
	desk.process, desk.title = "WhatsApp.exe", "WhatsApp" // a chat app, not an AI tool
	m.sampleUsage()
	desk.process, desk.title = "Claude.exe", "Claude"
	m.sampleUsage()

	m.sendUsage() // nothing finished yet: today is sent tomorrow
	if len(bodies) != 0 {
		t.Fatalf("sent an unfinished day: %v", bodies)
	}

	// A restart keeps the record.
	m = newMonitor(Config{APIURL: srv.URL, Token: "hpa_test"})
	*now = now.Add(24 * time.Hour)
	m.sendUsage()
	m.sendUsage() // once a day
	if len(bodies) != 1 || !strings.HasPrefix(bodies[0], "/api/agent/usage ") {
		t.Fatalf("expected one usage request, got %v", bodies)
	}
	body := strings.TrimPrefix(bodies[0], "/api/agent/usage ")
	if strings.Contains(body, "salary") || strings.Contains(body, "Priya") || strings.Contains(body, "Chrome") || strings.Contains(body, "whatsapp") {
		t.Fatalf("title or non-AI app leaked: %s", body)
	}
	var payload map[string][]map[string]any
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload) != 1 || len(payload["days"]) != 1 {
		t.Fatalf("unexpected payload %s", body)
	}
	day := payload["days"][0]
	for key := range day {
		if key != "day" && key != "apps" {
			t.Fatalf("unexpected field %q sent", key)
		}
	}
	if day["day"] != "2026-10-08" || len(day["apps"].([]any)) != 2 || day["apps"].([]any)[0] != "chatgpt" || day["apps"].([]any)[1] != "claude" {
		t.Fatalf("unexpected day %v", day)
	}
	if len(m.usage.Days) != 0 {
		t.Fatalf("sent days should be forgotten, have %v", m.usage.Days)
	}
}

func TestUsageOffWhenPolicySaysSo(t *testing.T) {
	t.Setenv("LOCALAPPDATA", t.TempDir())
	t.Setenv("HOME", t.TempDir())
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++; w.Write([]byte(`{"ok":true}`)) }))
	defer srv.Close()

	desk := &fakeDesktop{process: "chrome.exe", title: "Gemini - Google Chrome"}
	desk.install(t)
	now := setClock(t, time.Date(2026, 10, 8, 10, 0, 0, 0, time.Local))
	m := newMonitor(Config{APIURL: srv.URL, Token: "hpa_test"})
	m.sampleUsage()
	off := false
	m.policy = &Policy{ShareAiUsage: &off}
	m.sampleUsage()
	*now = now.Add(24 * time.Hour)
	m.sendUsage()
	if calls != 0 || len(m.usage.Days) != 0 {
		t.Fatalf("report is off: calls=%d days=%v", calls, m.usage.Days)
	}
}

func TestUninstallSaysGoodbyeFirst(t *testing.T) {
	t.Setenv("LOCALAPPDATA", t.TempDir())
	t.Setenv("HOME", t.TempDir())
	var order []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		order = append(order, r.Method+" "+r.URL.Path+" "+r.Header.Get("Authorization"))
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()
	if err := saveConfig(Config{APIURL: srv.URL, Token: "hpa_test", OrgName: "Acme"}); err != nil {
		t.Fatal(err)
	}
	old := removeAgent
	removeAgent = func() { order = append(order, "removed") }
	t.Cleanup(func() { removeAgent = old })

	uninstallByUser(true)
	if len(order) != 2 || order[0] != "POST /api/agent/goodbye Bearer hpa_test" || order[1] != "removed" {
		t.Fatalf("expected goodbye then removal, got %v", order)
	}

	// HighPre unreachable: removal still happens, without a long wait.
	srv.Close()
	order = nil
	start := time.Now()
	uninstallByUser(true)
	if len(order) != 1 || order[0] != "removed" || time.Since(start) > 6*time.Second {
		t.Fatalf("removal must not depend on HighPre: %v after %v", order, time.Since(start))
	}
}
