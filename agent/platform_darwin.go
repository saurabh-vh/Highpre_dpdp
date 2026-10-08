//go:build darwin

package main

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

// macOS integration using built-in tools only (no cgo): pbpaste for the
// clipboard, lsappinfo for the frontmost app, and AppleScript for browser tab
// titles and notifications. Runs as a per-user LaunchAgent; no admin rights.

// clipboardChanged polls the clipboard and compares an in-memory fingerprint.
// The fingerprint never leaves the process and is not stored.
func clipboardChanged(prev uint64) (uint64, bool) {
	out, err := exec.Command("pbpaste").Output()
	if err != nil {
		return prev, false
	}
	sum := sha256.Sum256(out)
	v := binary.LittleEndian.Uint64(sum[:8])
	return v, v != prev
}

func readClipboard() (string, error) {
	out, err := exec.Command("pbpaste").Output()
	if err != nil {
		return "", err
	}
	if len(out) > maxScanBytes {
		out = out[:maxScanBytes]
	}
	return string(out), nil
}

var reDisplayName = regexp.MustCompile(`"LSDisplayName"="([^"]*)"`)

var browserScripts = map[string]string{
	"Google Chrome":  `tell application "Google Chrome" to get title of active tab of front window`,
	"Microsoft Edge": `tell application "Microsoft Edge" to get title of active tab of front window`,
	"Brave Browser":  `tell application "Brave Browser" to get title of active tab of front window`,
	"Arc":            `tell application "Arc" to get title of active tab of front window`,
	"Safari":         `tell application "Safari" to get name of front document`,
}

// foregroundWindow returns the frontmost app and, for common browsers, the
// active tab title (macOS asks the user once for permission to read it).
func foregroundWindow() (process, title string) {
	front, err := exec.Command("lsappinfo", "front").Output()
	if err != nil {
		return "", ""
	}
	info, err := exec.Command("lsappinfo", "info", "-only", "name", strings.TrimSpace(string(front))).Output()
	if err != nil {
		return "", ""
	}
	if m := reDisplayName.FindSubmatch(info); m != nil {
		process = string(m[1])
	}
	// Only query a browser that is already frontmost, so nothing gets launched.
	if script, ok := browserScripts[process]; ok {
		if out, err := exec.Command("osascript", "-e", script).Output(); err == nil {
			title = strings.TrimSpace(string(out))
		}
	}
	return process, title
}

func appleScriptString(s string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s) + `"`
}

func notify(title, body string) {
	_ = exec.Command("osascript", "-e", "display notification "+appleScriptString(body)+" with title "+appleScriptString(title)).Run()
}

func dataDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "Application Support", "HighPre")
}

func installPath() string { return filepath.Join(dataDir(), "highpre-agent") }

func plistPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents", "in.highpre.agent.plist")
}

func osVersion() string {
	out, err := exec.Command("sw_vers", "-productVersion").Output()
	if err != nil {
		return "macOS"
	}
	return "macOS " + strings.TrimSpace(string(out))
}

const plistTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>in.highpre.agent</string>
  <key>ProgramArguments</key>
  <array><string>%s</string><string>--run</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
`

// install copies the agent and its configuration to Application Support and
// registers a LaunchAgent so it starts at login for this user only. (Company
// installs use the install.sh in the company package instead.)
func install(cfg Config, quiet bool) error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dataDir(), 0o700); err != nil {
		return err
	}
	target := installPath()
	if self != target {
		if err := copyFile(self, target, 0o755); err != nil {
			return err
		}
	}
	if err := saveConfig(cfg); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(plistPath()), 0o755); err != nil {
		return err
	}
	var escaped strings.Builder
	_ = xmlEscapeTo(&escaped, target)
	if err := os.WriteFile(plistPath(), []byte(fmt.Sprintf(plistTemplate, escaped.String())), 0o644); err != nil {
		return err
	}
	_ = exec.Command("launchctl", "unload", plistPath()).Run()
	if err := exec.Command("launchctl", "load", "-w", plistPath()).Run(); err != nil {
		return fmt.Errorf("couldn't start the agent: %w", err)
	}
	who := cfg.OrgName
	if who == "" {
		who = "your organisation"
	}
	if !quiet {
		notify("HighPre Agent installed", "Protecting this Mac for "+who+". It starts automatically when you log in.")
	}
	return nil
}

// applyUpdate replaces the installed binary with a verified new version and
// exits with an error code, which makes launchd (KeepAlive) start the new one.
func applyUpdate(staged string) error {
	if err := os.Rename(staged, installPath()); err != nil {
		return err
	}
	os.Exit(3)
	return nil
}

func markVersion() {}

func uninstall() {
	_ = exec.Command("launchctl", "unload", "-w", plistPath()).Run()
	_ = os.Remove(plistPath())
	_ = os.RemoveAll(dataDir())
}

func xmlEscapeTo(b *strings.Builder, s string) error {
	_, err := b.WriteString(strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(s))
	return err
}

func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".new"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, dst)
}
