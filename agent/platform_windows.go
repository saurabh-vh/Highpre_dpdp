//go:build windows

package main

import (
	_ "embed"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

// Windows integration through user32/kernel32 directly (no cgo, no keyboard
// hooks): the clipboard sequence number and text, and the foreground window's
// title and process name.

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")

	procGetClipboardSequenceNumber = user32.NewProc("GetClipboardSequenceNumber")
	procOpenClipboard              = user32.NewProc("OpenClipboard")
	procCloseClipboard             = user32.NewProc("CloseClipboard")
	procGetClipboardData           = user32.NewProc("GetClipboardData")
	procIsClipboardFormatAvailable = user32.NewProc("IsClipboardFormatAvailable")
	procGetForegroundWindow        = user32.NewProc("GetForegroundWindow")
	procGetWindowTextW             = user32.NewProc("GetWindowTextW")
	procGetWindowThreadProcessId   = user32.NewProc("GetWindowThreadProcessId")
	procGlobalLock                 = kernel32.NewProc("GlobalLock")
	procGlobalUnlock               = kernel32.NewProc("GlobalUnlock")
	procLstrlenW                   = kernel32.NewProc("lstrlenW")
	procRtlMoveMemory              = kernel32.NewProc("RtlMoveMemory")
	procOpenProcess                = kernel32.NewProc("OpenProcess")
	procQueryFullProcessImageNameW = kernel32.NewProc("QueryFullProcessImageNameW")
	procCloseHandle                = kernel32.NewProc("CloseHandle")
)

const (
	cfUnicodeText                  = 13
	processQueryLimitedInformation = 0x1000
	createNoWindow                 = 0x08000000
	detachedProcess                = 0x00000008
)

func clipboardChanged(prev uint64) (uint64, bool) {
	seq, _, _ := procGetClipboardSequenceNumber.Call()
	return uint64(seq), uint64(seq) != prev
}

func readClipboard() (string, error) {
	if ok, _, _ := procIsClipboardFormatAvailable.Call(cfUnicodeText); ok == 0 {
		return "", fmt.Errorf("no text on clipboard")
	}
	if ok, _, err := procOpenClipboard.Call(0); ok == 0 {
		return "", err
	}
	defer procCloseClipboard.Call()
	h, _, err := procGetClipboardData.Call(cfUnicodeText)
	if h == 0 {
		return "", err
	}
	ptr, _, err := procGlobalLock.Call(h)
	if ptr == 0 {
		return "", err
	}
	defer procGlobalUnlock.Call(h)
	// Copy the NUL-terminated UTF-16 string into Go memory, capped at the scan limit.
	n, _, _ := procLstrlenW.Call(ptr)
	if n == 0 {
		return "", nil
	}
	if n > maxScanBytes {
		n = maxScanBytes
	}
	chars := make([]uint16, n)
	procRtlMoveMemory.Call(uintptr(unsafe.Pointer(&chars[0])), ptr, n*2)
	return string(utf16.Decode(chars)), nil
}

func foregroundWindow() (process, title string) {
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd == 0 {
		return "", ""
	}
	buf := make([]uint16, 512)
	n, _, _ := procGetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	title = syscall.UTF16ToString(buf[:n])

	var pid uint32
	procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
	h, _, _ := procOpenProcess.Call(processQueryLimitedInformation, 0, uintptr(pid))
	if h == 0 {
		return "", title
	}
	defer procCloseHandle.Call(h)
	path := make([]uint16, 1024)
	size := uint32(len(path))
	if ok, _, _ := procQueryFullProcessImageNameW.Call(h, 0, uintptr(unsafe.Pointer(&path[0])), uintptr(unsafe.Pointer(&size))); ok != 0 {
		process = filepath.Base(syscall.UTF16ToString(path[:size]))
	}
	return process, title
}

func hidden(cmd *exec.Cmd) *exec.Cmd {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
	return cmd
}

func xmlEscape(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&apos;").Replace(s)
}

//go:embed assets/highpre.png
var logoPNG []byte

// Notifications appear as "HighPre" with its logo: the app ID is registered
// for this user under HKCU\Software\Classes\AppUserModelId (the documented way
// for unpackaged desktop apps), with a display name and icon.
const (
	toastAppID    = "HighPre.Agent"
	toastAppKey   = `HKCU\Software\Classes\AppUserModelId\` + toastAppID
	powershellApp = `{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe`
)

func logoPath() string { return filepath.Join(dataDir(), "highpre.png") }

// registerToastApp writes the logo and registers the HighPre notification identity. Safe to repeat.
func registerToastApp() bool {
	if err := os.MkdirAll(dataDir(), 0o700); err != nil {
		return false
	}
	if err := os.WriteFile(logoPath(), logoPNG, 0o644); err != nil {
		return false
	}
	if reg("add", toastAppKey, "/v", "DisplayName", "/t", "REG_SZ", "/d", "HighPre", "/f") != nil {
		return false
	}
	_ = reg("add", toastAppKey, "/v", "IconUri", "/t", "REG_SZ", "/d", logoPath(), "/f")
	_ = reg("add", toastAppKey, "/v", "IconBackgroundColor", "/t", "REG_SZ", "/d", "FF000000", "/f")
	return true
}

var toastAppReady = false

// notify shows a Windows toast notification from "HighPre", with the logo.
func notify(title, body string) {
	app, image := powershellApp, ""
	if toastAppReady || registerToastApp() {
		toastAppReady = true
		app = toastAppID
		image = `<image placement="appLogoOverride" src="` + xmlEscape("file:///"+filepath.ToSlash(logoPath())) + `"/>`
	}
	script := fmt.Sprintf(`[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast><visual><binding template="ToastGeneric">%s<text>%s</text><text>%s</text></binding></visual></toast>')
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('%s').Show([Windows.UI.Notifications.ToastNotification]::new($xml))`,
		strings.ReplaceAll(image, "'", "''"), strings.ReplaceAll(xmlEscape(title), "'", "''"), strings.ReplaceAll(xmlEscape(body), "'", "''"), app)
	u := utf16.Encode([]rune(script))
	b := make([]byte, len(u)*2)
	for i, v := range u {
		b[i*2], b[i*2+1] = byte(v), byte(v>>8)
	}
	_ = hidden(exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", base64.StdEncoding.EncodeToString(b))).Run()
}

func dataDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = os.TempDir()
	}
	return filepath.Join(base, "HighPre")
}

func installPath() string { return filepath.Join(dataDir(), "highpre-agent.exe") }

func osVersion() string {
	out, err := hidden(exec.Command("cmd", "/c", "ver")).Output()
	if err != nil {
		return "Windows"
	}
	return strings.TrimSpace(string(out))
}

const (
	runKey       = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
	uninstallKey = `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\HighPreAgent`
)

func reg(args ...string) error { return hidden(exec.Command("reg", args...)).Run() }

// install copies the agent (with its embedded configuration) to
// %LOCALAPPDATA%\HighPre, starts it at sign-in for this user only, registers
// it under Settings → Apps for easy removal, and starts it now. Company
// deployments run it in the user's context with --quiet.
func install(cfg Config, quiet bool) error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	target := installPath()
	if err := os.MkdirAll(dataDir(), 0o700); err != nil {
		return err
	}
	if !strings.EqualFold(self, target) {
		if err := copyFile(self, target); err != nil {
			return err
		}
	}
	// Saved separately so the configuration survives updates, which replace the binary.
	if err := saveConfig(cfg); err != nil {
		return err
	}
	quoted := `"` + target + `"`
	if err := reg("add", runKey, "/v", "HighPreAgent", "/t", "REG_SZ", "/d", quoted+" --run", "/f"); err != nil {
		return fmt.Errorf("couldn't set up start at sign-in: %w", err)
	}
	_ = reg("add", uninstallKey, "/v", "DisplayName", "/t", "REG_SZ", "/d", "HighPre Agent", "/f")
	_ = reg("add", uninstallKey, "/v", "Publisher", "/t", "REG_SZ", "/d", "HighPre", "/f")
	_ = reg("add", uninstallKey, "/v", "DisplayVersion", "/t", "REG_SZ", "/d", Version, "/f")
	_ = reg("add", uninstallKey, "/v", "DisplayIcon", "/t", "REG_SZ", "/d", quoted, "/f")
	_ = reg("add", uninstallKey, "/v", "UninstallString", "/t", "REG_SZ", "/d", quoted+" --uninstall", "/f")
	_ = reg("add", uninstallKey, "/v", "NoModify", "/t", "REG_DWORD", "/d", "1", "/f")

	cmd := exec.Command(target, "--run")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: detachedProcess | createNoWindow}
	if err := cmd.Start(); err != nil {
		return err
	}
	who := cfg.OrgName
	if who == "" {
		who = "your organisation"
	}
	if !quiet {
		notify("HighPre Agent installed", "Protecting this computer for "+who+". It starts automatically when you sign in.")
	}
	return nil
}

// applyUpdate swaps in a verified new version and starts it. Windows can't
// overwrite a running .exe but can rename it; run() deletes the .old copy.
func applyUpdate(staged string) error {
	target := installPath()
	old := target + ".old"
	_ = os.Remove(old)
	if err := os.Rename(target, old); err != nil {
		return err
	}
	if err := os.Rename(staged, target); err != nil {
		_ = os.Rename(old, target)
		return err
	}
	if controlLn != nil {
		controlLn.Close()
	}
	cmd := exec.Command(target, "--run")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: detachedProcess | createNoWindow}
	if err := cmd.Start(); err != nil {
		_ = os.Rename(target, staged)
		_ = os.Rename(old, target)
		return err
	}
	os.Exit(0)
	return nil
}

// markVersion keeps the version shown in Settings → Apps current after updates.
func markVersion() {
	_ = reg("add", uninstallKey, "/v", "DisplayVersion", "/t", "REG_SZ", "/d", Version, "/f")
}

// uninstall removes start-at-sign-in and the Apps entry, then deletes the
// install folder once this process has exited.
func uninstall() {
	_ = reg("delete", runKey, "/v", "HighPreAgent", "/f")
	_ = reg("delete", uninstallKey, "/f")
	dir := dataDir()
	// The notification identity goes a few seconds later, after the "removed" message has used it.
	_ = hidden(exec.Command("cmd", "/c", "ping -n 3 127.0.0.1 >nul & reg delete \""+toastAppKey+"\" /f >nul 2>&1 & rmdir /s /q \""+dir+"\"")).Start()
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".new"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
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
	_ = os.Remove(dst)
	return os.Rename(tmp, dst)
}
