package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"sync"
	"time"
)

// Event is everything the agent ever reports about a detection: which kind
// of data, which app, and when. No text, no hashes, no window titles.
type Event struct {
	DataType   string    `json:"dataType"`
	App        string    `json:"app"`
	OccurredAt time.Time `json:"occurredAt"`
}

// Policy is set by the organisation's owners in the dashboard: which kinds of
// data to watch for, and approved apps where no warning is needed.
type Policy struct {
	DataTypes   []string `json:"dataTypes"`
	AllowedApps []string `json:"allowedApps"`
}

type heartbeatReply struct {
	Policy        *Policy `json:"policy"`
	LatestVersion string  `json:"latestVersion"`
}

var errRevoked = errors.New("device revoked")

type client struct {
	cfg   Config
	http  *http.Client
	mu    sync.Mutex
	queue []Event
	file  string
}

func newClient(cfg Config) *client {
	c := &client{cfg: cfg, http: &http.Client{Timeout: 15 * time.Second}, file: filepath.Join(dataDir(), "queue.json")}
	// Detections made while offline are kept (types and apps only) and sent later.
	if data, err := os.ReadFile(c.file); err == nil {
		_ = json.Unmarshal(data, &c.queue)
	}
	return c
}

func (c *client) do(method, path string, body any, token string) (*http.Response, error) {
	var reader io.Reader
	if body != nil {
		payload, _ := json.Marshal(body)
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequest(method, c.cfg.APIURL+path, reader)
	if err != nil {
		return nil, err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("User-Agent", "HighPreAgent/"+Version+" ("+runtime.GOOS+")")
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusGone {
		res.Body.Close()
		return nil, errRevoked
	}
	if res.StatusCode >= 300 {
		res.Body.Close()
		return nil, fmt.Errorf("server returned %d", res.StatusCode)
	}
	return res, nil
}

// post sends JSON and decodes the reply into out (when not nil).
func (c *client) post(path string, body, out any) error {
	res, err := c.do(http.MethodPost, path, body, c.cfg.Token)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if out != nil {
		return json.NewDecoder(io.LimitReader(res.Body, 64*1024)).Decode(out)
	}
	return nil
}

func hostname() string {
	host, _ := os.Hostname()
	if len(host) > 64 {
		host = host[:64]
	}
	return host
}

func (c *client) heartbeat() (heartbeatReply, error) {
	var reply heartbeatReply
	err := c.post("/api/agent/heartbeat", map[string]string{
		"hostname":     hostname(),
		"osVersion":    osVersion(),
		"agentVersion": Version,
	}, &reply)
	return reply, err
}

// enroll exchanges a company installer's enrolment key for this computer's
// own device token. The OS account name tells owners whose computer it is.
func (c *client) enroll() (string, error) {
	osUser := ""
	if u, err := user.Current(); err == nil {
		osUser = filepath.Base(u.Username) // DOMAIN\name → name on Windows
	}
	if len(osUser) > 64 {
		osUser = osUser[:64]
	}
	var reply struct {
		Token string `json:"token"`
	}
	res, err := c.do(http.MethodPost, "/api/agent/enroll", map[string]string{
		"enrollKey":    c.cfg.EnrollKey,
		"hostname":     hostname(),
		"osUser":       osUser,
		"osVersion":    osVersion(),
		"agentVersion": Version,
		"platform":     platformKey(),
	}, "")
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if err := json.NewDecoder(io.LimitReader(res.Body, 4096)).Decode(&reply); err != nil || reply.Token == "" {
		return "", errors.New("enrolment failed")
	}
	return reply.Token, nil
}

// getBytes fetches an authenticated download, capped at max bytes.
func (c *client) getBytes(path string, query url.Values, max int64) ([]byte, int, error) {
	res, err := c.do(http.MethodGet, path+"?"+query.Encode(), nil, c.cfg.Token)
	if err != nil {
		return nil, 0, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, max+1))
	if err != nil {
		return nil, 0, err
	}
	if int64(len(data)) > max {
		return nil, 0, errors.New("response too large")
	}
	return data, res.StatusCode, nil
}

func (c *client) enqueue(e Event) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.queue) >= 200 {
		c.queue = c.queue[1:]
	}
	c.queue = append(c.queue, e)
	c.persist()
}

// flush sends queued events in batches; failures keep them for the next try.
func (c *client) flush() error {
	c.mu.Lock()
	batch := append([]Event(nil), c.queue...)
	c.mu.Unlock()
	if len(batch) == 0 {
		return nil
	}
	if len(batch) > 50 {
		batch = batch[:50]
	}
	if err := c.post("/api/agent/alerts", map[string]any{"events": batch}, nil); err != nil {
		return err
	}
	c.mu.Lock()
	c.queue = c.queue[len(batch):]
	c.persist()
	c.mu.Unlock()
	return nil
}

func (c *client) persist() {
	data, _ := json.Marshal(c.queue)
	_ = os.MkdirAll(filepath.Dir(c.file), 0o700)
	_ = os.WriteFile(c.file, data, 0o600)
}

// platformKey matches the platform keys in src/lib/agent/catalog.ts.
func platformKey() string {
	switch {
	case runtime.GOOS == "windows":
		return "windows"
	case runtime.GOOS == "darwin" && runtime.GOARCH == "arm64":
		return "mac-arm64"
	case runtime.GOOS == "darwin":
		return "mac-intel"
	}
	return runtime.GOOS
}
