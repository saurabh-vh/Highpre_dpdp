// HighPre Agent: warns people before they paste passwords, keys, card numbers
// or ID numbers into AI assistants and chat apps, and tells the organisation's
// owners that it happened.
//
// Privacy by design: copied text is inspected in memory on this device and
// discarded. Only the kind of data (e.g. "card_number"), the app (e.g.
// "chatgpt") and the time are sent to HighPre.
package main

import (
	"bufio"
	"errors"
	"net"
	"os"
	"path/filepath"
	"time"
)

// Version is compared with the server's latest build for automatic updates.
// agent/build.mjs reads it from here.
const Version = "1.1.0"

// controlAddr keeps one copy running and lets --uninstall stop it.
const controlAddr = "127.0.0.1:47613"

// controlLn is released before an update starts the new version.
var controlLn net.Listener

func hasFlag(flag string) bool {
	for _, a := range os.Args[1:] {
		if a == flag {
			return true
		}
	}
	return false
}

func main() {
	if hasFlag("--uninstall") {
		uninstallByUser(hasFlag("--quiet"))
		return
	}

	if hasFlag("--run") {
		cfg, err := loadConfig(true)
		if err != nil {
			os.Exit(1)
		}
		run(cfg)
		return
	}

	// Opened from Downloads, the macOS installer or an MDM: install, start, and exit.
	// --quiet skips the confirmation notification for silent company deployments.
	cfg, err := loadConfig(false)
	if err != nil {
		notify("HighPre Agent", "This copy isn't linked to an organisation. Download it again from your HighPre dashboard.")
		os.Exit(1)
	}
	// Reinstalling a company installer keeps the token this computer already enrolled with.
	if prev, err := readConfigFile(installedConfigPath()); err == nil && cfg.Token == "" && prev.EnrollKey == cfg.EnrollKey {
		cfg.Token = prev.Token
	}
	stopRunning()
	if err := install(cfg, hasFlag("--quiet")); err != nil {
		notify("HighPre Agent", "Installation failed: "+err.Error())
		os.Exit(1)
	}
}

func run(cfg Config) {
	// The previous version may still be exiting after an update; retry briefly.
	var err error
	for i := 0; i < 10; i++ {
		if controlLn, err = net.Listen("tcp", controlAddr); err == nil {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if err != nil {
		return // already running
	}
	go func() {
		for {
			conn, err := controlLn.Accept()
			if err != nil {
				return
			}
			line, _ := bufio.NewReader(conn).ReadString('\n')
			conn.Close()
			if line == "quit\n" {
				os.Exit(0)
			}
		}
	}()
	_ = os.Remove(installPath() + ".old") // left behind by an update on Windows
	if runningInstalled() {
		markVersion()
	}

	if cfg.Token == "" {
		cfg = enrollUntilDone(cfg)
	}

	marker := filepath.Join(dataDir(), "welcomed")
	if _, err := os.Stat(marker); err != nil {
		_ = os.MkdirAll(dataDir(), 0o700)
		_ = os.WriteFile(marker, []byte(time.Now().Format(time.RFC3339)), 0o600)
		org := cfg.OrgName
		if org == "" {
			org = "your organisation"
		}
		notify("HighPre Agent is on",
			"It warns you before passwords, keys, card or ID numbers are pasted into AI or chat apps, and lets "+org+"'s owners know. What you copy never leaves this computer.")
	}

	newMonitor(cfg).loop()
}

// enrollUntilDone registers a company install, retrying while offline. If the
// organisation removed this computer, the agent stays off quietly.
func enrollUntilDone(cfg Config) Config {
	c := newClient(cfg)
	wait := time.Minute
	for {
		token, err := c.enroll()
		if err == nil {
			cfg.Token = token
			_ = saveConfig(cfg)
			return cfg
		}
		if errors.Is(err, errRevoked) {
			os.Exit(0)
		}
		time.Sleep(wait)
		if wait < time.Hour {
			wait *= 2
		}
	}
}

// removeAgent is the platform uninstall, swappable in tests.
var removeAgent = uninstall

// uninstallByUser runs for --uninstall: the person (or their IT team) is
// removing the agent. HighPre is told first, so owners can see the gap; a
// failure there never stops the removal.
func uninstallByUser(quiet bool) {
	if cfg, err := loadConfig(true); err == nil {
		goodbye(cfg)
	}
	stopRunning()
	removeAgent()
	if !quiet {
		notify("HighPre Agent removed", "The agent has been removed from this computer.")
	}
}

// stopRunning asks a running copy to exit (before reinstalling or uninstalling).
func stopRunning() {
	conn, err := net.DialTimeout("tcp", controlAddr, time.Second)
	if err != nil {
		return
	}
	_, _ = conn.Write([]byte("quit\n"))
	conn.Close()
	time.Sleep(700 * time.Millisecond)
}
