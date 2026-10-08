//go:build !windows && !darwin

package main

import (
	"errors"
	"os"
	"path/filepath"
)

// Other platforms (e.g. Linux CI) compile but don't monitor anything.

func clipboardChanged(prev uint64) (uint64, bool) { return prev, false }
func readClipboard() (string, error)               { return "", errors.New("unsupported platform") }
func foregroundWindow() (string, string)           { return "", "" }
func notify(title, body string)                    {}
func osVersion() string                            { return "unsupported" }
func install(Config, bool) error                   { return errors.New("only Windows and macOS are supported") }
func uninstall()                                   {}
func applyUpdate(string) error                     { return errors.New("unsupported platform") }
func markVersion()                                 {}
func installPath() string                          { return filepath.Join(dataDir(), "highpre-agent") }

func dataDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".highpre")
}
