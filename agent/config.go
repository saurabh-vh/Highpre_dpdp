package main

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
)

// Config links an install to one device in a HighPre organisation. The
// dashboard writes it when you download the agent: appended to the end of the
// Windows .exe, or as config.json beside the macOS binary.
//
// A personal download carries a device Token. A company installer (deployed
// with Intune, Jamf and similar) carries an EnrollKey instead; on first run the
// agent exchanges it for a device token, which is then saved in dataDir.
type Config struct {
	APIURL    string `json:"apiUrl"`
	Token     string `json:"token,omitempty"`
	EnrollKey string `json:"enrollKey,omitempty"`
	OrgName   string `json:"orgName"`
	UserName  string `json:"userName,omitempty"`
}

func (c Config) valid() bool { return c.APIURL != "" && (c.Token != "" || c.EnrollKey != "") }

// Trailer layout at the end of the executable: JSON, 4-byte little-endian length, magic.
const trailerMagic = "HPCFG01!"

func installedConfigPath() string { return filepath.Join(dataDir(), "config.json") }

// loadConfig finds this install's configuration. The running agent prefers the
// copy saved in dataDir (it holds the enrolled token and survives updates,
// which replace the binary); the installer prefers the one it was shipped with.
func loadConfig(preferInstalled bool) (Config, error) {
	exe, err := os.Executable()
	if err != nil {
		return Config{}, err
	}
	shipped := func() (Config, error) {
		if cfg, err := readTrailer(exe); err == nil {
			return cfg, nil
		}
		return readConfigFile(filepath.Join(filepath.Dir(exe), "config.json"))
	}
	if preferInstalled {
		if cfg, err := readConfigFile(installedConfigPath()); err == nil {
			return cfg, nil
		}
		return shipped()
	}
	if cfg, err := shipped(); err == nil {
		return cfg, nil
	}
	return readConfigFile(installedConfigPath())
}

func readConfigFile(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, errors.New("no configuration found")
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil || !cfg.valid() {
		return Config{}, errors.New("invalid configuration")
	}
	return cfg, nil
}

func saveConfig(cfg Config) error {
	data, _ := json.MarshalIndent(cfg, "", "  ")
	if err := os.MkdirAll(dataDir(), 0o700); err != nil {
		return err
	}
	return os.WriteFile(installedConfigPath(), data, 0o600)
}

func readTrailer(path string) (Config, error) {
	f, err := os.Open(path)
	if err != nil {
		return Config{}, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.Size() < 12 {
		return Config{}, errors.New("no trailer")
	}
	tail := make([]byte, 12)
	if _, err := f.ReadAt(tail, info.Size()-12); err != nil {
		return Config{}, err
	}
	if string(tail[4:]) != trailerMagic {
		return Config{}, errors.New("no trailer")
	}
	n := int64(binary.LittleEndian.Uint32(tail[:4]))
	if n <= 0 || n > 64*1024 || n > info.Size()-12 {
		return Config{}, errors.New("bad trailer")
	}
	buf := make([]byte, n)
	if _, err := f.ReadAt(buf, info.Size()-12-n); err != nil && !errors.Is(err, io.EOF) {
		return Config{}, err
	}
	var cfg Config
	if err := json.Unmarshal(buf, &cfg); err != nil || !cfg.valid() {
		return Config{}, errors.New("invalid trailer")
	}
	return cfg, nil
}
