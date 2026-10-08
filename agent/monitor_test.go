package main

import (
	"encoding/binary"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// fakeDesktop simulates the clipboard and foreground window.
type fakeDesktop struct {
	version uint64
	text    string
	process string
	title   string
	notes   []string
}

func (f *fakeDesktop) install(t *testing.T) {
	oldChanged, oldRead, oldFg, oldNotify := clipChanged, clipRead, fgWindow, notifyUser
	clipChanged = func(prev uint64) (uint64, bool) { return f.version, f.version != prev }
	clipRead = func() (string, error) { return f.text, nil }
	fgWindow = func() (string, string) { return f.process, f.title }
	notifyUser = func(title, body string) { f.notes = append(f.notes, title+": "+body) }
	t.Cleanup(func() { clipChanged, clipRead, fgWindow, notifyUser = oldChanged, oldRead, oldFg, oldNotify })
}

func (f *fakeDesktop) copy(text string) { f.version++; f.text = text }

func TestMonitorReportsOnlyTypesAndApps(t *testing.T) {
	t.Setenv("LOCALAPPDATA", t.TempDir())
	t.Setenv("HOME", t.TempDir())

	var mu sync.Mutex
	var bodies []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer hpa_test" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		b, _ := io.ReadAll(r.Body)
		mu.Lock()
		bodies = append(bodies, r.URL.Path+" "+string(b))
		mu.Unlock()
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	desk := &fakeDesktop{process: "winword.exe", title: "Report - Word"}
	desk.install(t)
	m := newMonitor(Config{APIURL: srv.URL, Token: "hpa_test"})

	secret := "Card 4111 1111 1111 1111"
	desk.copy(secret)
	m.tick() // copied in Word: nothing to report yet
	if len(bodies) != 0 || len(desk.notes) != 0 {
		t.Fatalf("reported too early: %v %v", bodies, desk.notes)
	}

	desk.process, desk.title = "chrome.exe", "ChatGPT - Google Chrome"
	m.tick() // ChatGPT comes to the front while the card number is on the clipboard
	m.tick() // and stays there: no duplicate alert
	if len(desk.notes) != 1 || !strings.Contains(desk.notes[0], "a card number") || !strings.Contains(desk.notes[0], "ChatGPT") {
		t.Fatalf("expected one warning about a card number and ChatGPT, got %v", desk.notes)
	}
	if len(bodies) != 1 || !strings.HasPrefix(bodies[0], "/api/agent/alerts ") {
		t.Fatalf("expected one alerts request, got %v", bodies)
	}

	// The request must contain only dataType, app and occurredAt.
	var payload struct {
		Events []map[string]any `json:"events"`
	}
	if err := json.Unmarshal([]byte(strings.TrimPrefix(bodies[0], "/api/agent/alerts ")), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Events) != 1 || payload.Events[0]["dataType"] != "card_number" || payload.Events[0]["app"] != "chatgpt" {
		t.Fatalf("unexpected payload %v", payload.Events)
	}
	for key := range payload.Events[0] {
		if key != "dataType" && key != "app" && key != "occurredAt" {
			t.Fatalf("unexpected field %q sent", key)
		}
	}
	for _, b := range bodies {
		if strings.Contains(b, "4111") || strings.Contains(b, "ChatGPT - Google Chrome") {
			t.Fatalf("clipboard content or window title leaked: %s", b)
		}
	}

	// Copying something harmless clears the pending state.
	desk.copy("See you at 3pm")
	m.tick()
	if m.pending != nil {
		t.Fatal("pending should be cleared after a harmless copy")
	}
}

func TestPolicyLimitsTypesAndApprovesApps(t *testing.T) {
	t.Setenv("LOCALAPPDATA", t.TempDir())
	t.Setenv("HOME", t.TempDir())
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"ok":true}`)) }))
	defer srv.Close()

	desk := &fakeDesktop{}
	desk.install(t)
	m := newMonitor(Config{APIURL: srv.URL, Token: "hpa_test"})
	m.policy = &Policy{DataTypes: []string{"password"}, AllowedApps: []string{"claude"}}

	desk.copy("Card 4111 1111 1111 1111") // not watched by this organisation
	desk.process, desk.title = "chrome.exe", "ChatGPT - Google Chrome"
	m.tick()
	if len(desk.notes) != 0 {
		t.Fatalf("warned about an unwatched type: %v", desk.notes)
	}

	desk.copy("password: S3cret!pass")
	desk.process, desk.title = "Claude.exe", "Claude" // approved company tool
	m.tick()
	if len(desk.notes) != 0 {
		t.Fatalf("warned in an approved app: %v", desk.notes)
	}
	desk.process, desk.title = "chrome.exe", "ChatGPT - Google Chrome"
	m.tick()
	if len(desk.notes) != 1 || !strings.Contains(desk.notes[0], "a password") {
		t.Fatalf("expected one password warning, got %v", desk.notes)
	}
}

func TestHeartbeatAppliesPolicyAndOffersUpdate(t *testing.T) {
	t.Setenv("LOCALAPPDATA", t.TempDir())
	t.Setenv("HOME", t.TempDir())
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"ok":true,"policy":{"dataTypes":["card_number"],"allowedApps":["chatgpt"]},"latestVersion":"99.0.0"}`))
	}))
	defer srv.Close()

	m := newMonitor(Config{APIURL: srv.URL, Token: "hpa_test"})
	if !m.sendHeartbeat() {
		t.Fatal("expected the heartbeat to report a newer version")
	}
	if m.policy == nil || len(m.policy.DataTypes) != 1 || !m.approved("chatgpt") {
		t.Fatalf("policy not applied: %+v", m.policy)
	}
	// The policy is kept for the next start, even when offline.
	if again := newMonitor(Config{APIURL: "http://127.0.0.1:1", Token: "hpa_test"}); again.policy == nil || !again.approved("chatgpt") {
		t.Fatal("policy not persisted")
	}
}

func TestEnrollExchangesCompanyKeyForToken(t *testing.T) {
	t.Setenv("LOCALAPPDATA", t.TempDir())
	t.Setenv("HOME", t.TempDir())
	var got map[string]string
	revoked := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/agent/enroll" || r.Header.Get("Authorization") != "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if revoked {
			w.WriteHeader(http.StatusGone)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		w.Write([]byte(`{"token":"hpa_enrolled"}`))
	}))
	defer srv.Close()

	cfg := enrollUntilDone(Config{APIURL: srv.URL, EnrollKey: "hpe_company", OrgName: "Acme"})
	if cfg.Token != "hpa_enrolled" || got["enrollKey"] != "hpe_company" || got["hostname"] == "" {
		t.Fatalf("enrolment failed: cfg=%+v body=%v", cfg, got)
	}
	if saved, err := readConfigFile(installedConfigPath()); err != nil || saved.Token != "hpa_enrolled" {
		t.Fatalf("enrolled token not saved: %+v %v", saved, err)
	}

	revoked = true
	if _, err := newClient(cfg).enroll(); err != errRevoked {
		t.Fatalf("a removed computer should stay off, got %v", err)
	}
}

func TestReadTrailer(t *testing.T) {
	cfg := Config{APIURL: "https://app.example.in", Token: "hpa_x", OrgName: "Acme"}
	data, _ := json.Marshal(cfg)
	n := make([]byte, 4)
	binary.LittleEndian.PutUint32(n, uint32(len(data)))
	path := filepath.Join(t.TempDir(), "agent.exe")
	content := append(append(append([]byte("MZ binary bytes"), data...), n...), []byte(trailerMagic)...)
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := readTrailer(path)
	if err != nil || got != cfg {
		t.Fatalf("readTrailer = %+v, %v", got, err)
	}
	if err := os.WriteFile(path, []byte("no trailer here"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := readTrailer(path); err == nil {
		t.Fatal("expected an error without a trailer")
	}
}
