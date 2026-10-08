package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Automatic updates. The server offers a newer build; the agent installs it
// only if it carries a valid Ed25519 signature from the key whose public half
// was compiled into this binary (agent/build.mjs sets it with -ldflags). A
// compromised server or network can't push code without that key, and builds
// made without a key never update themselves.

// updatePublicKey is the base64 Ed25519 public key, set at build time.
var updatePublicKey = ""

const maxUpdateBytes = 64 << 20

type updateOffer struct {
	Version   string `json:"version"`
	SHA256    string `json:"sha256"`
	Signature string `json:"signature"`
}

// signedMessage binds the signature to platform and version, so an old or
// other-platform build can't be replayed as an update.
func signedMessage(platform, version, sum string) []byte {
	return []byte("highpre-agent|" + platform + "|" + version + "|" + sum)
}

// newerVersion reports whether a is a higher dotted version than b.
func newerVersion(a, b string) bool {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(pb[i])
		}
		if x != y {
			return x > y
		}
	}
	return false
}

// verifyUpdate checks the downloaded binary against the offer and the embedded key.
func verifyUpdate(pubKey string, platform string, offer updateOffer, binary []byte) error {
	key, err := base64.StdEncoding.DecodeString(pubKey)
	if err != nil || len(key) != ed25519.PublicKeySize {
		return errors.New("updates are not enabled in this build")
	}
	sum := sha256.Sum256(binary)
	got := hex.EncodeToString(sum[:])
	if !strings.EqualFold(got, offer.SHA256) {
		return errors.New("update checksum mismatch")
	}
	sig, err := base64.StdEncoding.DecodeString(offer.Signature)
	if err != nil || !ed25519.Verify(ed25519.PublicKey(key), signedMessage(platform, offer.Version, got), sig) {
		return errors.New("update signature invalid")
	}
	return nil
}

// checkForUpdate downloads, verifies and stages a newer agent next to the
// installed one. It returns the staged path, or "" when there's nothing to do.
func (c *client) checkForUpdate() (string, error) {
	if updatePublicKey == "" || !isInstalledCopy() {
		return "", nil
	}
	q := url.Values{"platform": {platformKey()}, "version": {Version}}
	data, status, err := c.getBytes("/api/agent/update", q, 16*1024)
	if err != nil || status == http.StatusNoContent || len(data) == 0 {
		return "", err
	}
	var offer updateOffer
	if err := json.Unmarshal(data, &offer); err != nil || !newerVersion(offer.Version, Version) {
		return "", err
	}
	binary, _, err := c.getBytes("/api/agent/update/download", url.Values{"platform": {platformKey()}, "version": {offer.Version}}, maxUpdateBytes)
	if err != nil {
		return "", err
	}
	if err := verifyUpdate(updatePublicKey, platformKey(), offer, binary); err != nil {
		return "", err
	}
	staged := installPath() + ".new"
	_ = os.MkdirAll(filepath.Dir(staged), 0o700)
	if err := os.WriteFile(staged, binary, 0o755); err != nil {
		return "", err
	}
	return staged, nil
}

// isInstalledCopy is swappable in tests.
var isInstalledCopy = runningInstalled

// runningInstalled is true when this process is the installed copy and that
// copy is writable by this user. Company installs on macOS live in a
// root-owned folder and are updated by the MDM instead.
func runningInstalled() bool {
	self, err := os.Executable()
	if err != nil {
		return false
	}
	if resolved, err := filepath.EvalSymlinks(self); err == nil {
		self = resolved
	}
	if !strings.EqualFold(filepath.Clean(self), filepath.Clean(installPath())) {
		return false
	}
	f, err := os.OpenFile(filepath.Join(filepath.Dir(self), ".write-test"), os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return false
	}
	f.Close()
	_ = os.Remove(f.Name())
	return true
}
