package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestNewerVersion(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"1.1.0", "1.0.0", true},
		{"1.10.0", "1.9.9", true},
		{"2.0", "1.99.99", true},
		{"1.0.0", "1.0.0", false},
		{"1.0.0", "1.1.0", false},
		{"1.0.1", "1.0", true},
	}
	for _, c := range cases {
		if got := newerVersion(c.a, c.b); got != c.want {
			t.Errorf("newerVersion(%q, %q) = %v", c.a, c.b, got)
		}
	}
}

func signedOffer(t *testing.T, priv ed25519.PrivateKey, platform, version string, binary []byte) updateOffer {
	t.Helper()
	sum := sha256.Sum256(binary)
	hexSum := hex.EncodeToString(sum[:])
	return updateOffer{Version: version, SHA256: hexSum, Signature: base64.StdEncoding.EncodeToString(ed25519.Sign(priv, signedMessage(platform, version, hexSum)))}
}

func TestVerifyUpdate(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	_, otherPriv, _ := ed25519.GenerateKey(rand.Reader)
	pubB64 := base64.StdEncoding.EncodeToString(pub)
	binary := []byte("new agent build")
	good := signedOffer(t, priv, "windows", "1.2.0", binary)

	if err := verifyUpdate(pubB64, "windows", good, binary); err != nil {
		t.Fatalf("valid update rejected: %v", err)
	}
	if err := verifyUpdate(pubB64, "windows", good, []byte("tampered build")); err == nil {
		t.Fatal("tampered binary accepted")
	}
	if err := verifyUpdate(pubB64, "mac-arm64", good, binary); err == nil {
		t.Fatal("update for another platform accepted")
	}
	replayed := good
	replayed.Version = "9.9.9"
	if err := verifyUpdate(pubB64, "windows", replayed, binary); err == nil {
		t.Fatal("signature accepted for a different version")
	}
	if err := verifyUpdate(pubB64, "windows", signedOffer(t, otherPriv, "windows", "1.2.0", binary), binary); err == nil {
		t.Fatal("update signed by another key accepted")
	}
	if err := verifyUpdate("", "windows", good, binary); err == nil {
		t.Fatal("build without an update key must never update")
	}
}

func TestCheckForUpdateStagesOnlyVerifiedBuilds(t *testing.T) {
	t.Setenv("LOCALAPPDATA", t.TempDir())
	t.Setenv("HOME", t.TempDir())
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	oldKey, oldInstalled := updatePublicKey, isInstalledCopy
	updatePublicKey, isInstalledCopy = base64.StdEncoding.EncodeToString(pub), func() bool { return true }
	t.Cleanup(func() { updatePublicKey, isInstalledCopy = oldKey, oldInstalled })

	binary := []byte("agent v9")
	offer := signedOffer(t, priv, platformKey(), "9.0.0", binary)
	serve := binary
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/agent/update":
			_ = json.NewEncoder(w).Encode(offer)
		case "/api/agent/update/download":
			_, _ = w.Write(serve)
		}
	}))
	defer srv.Close()
	c := newClient(Config{APIURL: srv.URL, Token: "hpa_test"})

	staged, err := c.checkForUpdate()
	if err != nil || staged == "" {
		t.Fatalf("expected a staged update, got %q, %v", staged, err)
	}
	if got, _ := os.ReadFile(staged); string(got) != "agent v9" {
		t.Fatalf("staged file has %q", got)
	}
	_ = os.Remove(staged)

	serve = []byte("something else")
	if staged, err := c.checkForUpdate(); err == nil || staged != "" {
		t.Fatalf("tampered download was staged: %q, %v", staged, err)
	}
}
