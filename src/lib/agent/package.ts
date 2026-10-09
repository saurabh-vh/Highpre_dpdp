import "server-only";
import { readFile } from "fs/promises";
import { join } from "path";
import { AGENT_PLATFORMS, type AgentPlatform, type DesktopPlatform } from "./catalog";
import { createZip } from "./zip";

/** Configuration baked into each download; read by agent/config.go. `uninstallKey`: browser extension only. */
export type AgentConfig = { apiUrl: string; token: string; orgName: string; userName: string; uninstallKey?: string };
/** Company installers carry an enrolment key instead of a device token. */
export type CompanyConfig = { apiUrl: string; enrollKey: string; orgName: string };

const TRAILER_MAGIC = "HPCFG01!";

/** Where `npm run build:agent` (or the Docker build) puts the compiled agents. */
export const agentDistDir = () => process.env.AGENT_DIST_DIR || join(process.cwd(), "agent", "dist");

/** Appends the configuration to a Windows executable: JSON, 4-byte length, magic. */
export function withTrailer(exe: Buffer, config: AgentConfig | CompanyConfig): Buffer {
  const json = Buffer.from(JSON.stringify(config), "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(json.length, 0);
  return Buffer.concat([exe, json, len, Buffer.from(TRAILER_MAGIC, "ascii")]);
}

const INSTALL_COMMAND = `#!/bin/bash
# Installs HighPre Agent for this user. No administrator password needed.
cd "$(dirname "$0")" || exit 1
# You opened this installer yourself, so clear the download flag on its files.
xattr -dr com.apple.quarantine . 2>/dev/null
if ./highpre-agent --install; then
  echo ""
  echo "HighPre Agent is installed and running. You can close this window."
else
  echo ""
  echo "Installation failed. Contact your HighPre administrator."
fi
`;

const UNINSTALL_COMMAND = `#!/bin/bash
# Removes HighPre Agent from this Mac.
"$HOME/Library/Application Support/HighPre/highpre-agent" --uninstall
echo "HighPre Agent has been removed. You can close this window."
`;

const README = (config: AgentConfig) => `HighPre Agent for ${config.orgName}

Install: double-click "Install HighPre Agent.command".
If macOS says it can't verify the developer, right-click the file, choose Open,
then Open again.

What it does
- Warns you when your clipboard holds a password, API key, card number,
  Aadhaar, PAN, passport or bank details while an AI assistant or chat app
  (ChatGPT, Claude, Gemini, Copilot, WhatsApp, Slack and others) is open.
- Tells your organisation's owners which kind of data and which app.

What it never does
- It never sends what you copied, or any hash of it, to HighPre.
- It doesn't record keystrokes, screens or browsing history.

Remove it any time: double-click "Uninstall HighPre Agent.command".
`;

const MDM_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>in.highpre.agent</string>
  <key>ProgramArguments</key>
  <array><string>/Library/Application Support/HighPre/highpre-agent</string><string>--run</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>`;

const MDM_INSTALL_SH = `#!/bin/bash
# Installs HighPre Agent for every user of this Mac. Run as root, e.g. as a
# Jamf, Kandji or Intune shell script. Each user's agent registers itself the
# first time it starts.
set -e
cd "$(dirname "$0")"
DIR="/Library/Application Support/HighPre"
PLIST="/Library/LaunchAgents/in.highpre.agent.plist"
mkdir -p "$DIR"
install -m 755 highpre-agent "$DIR/highpre-agent"
install -m 644 config.json "$DIR/config.json"
xattr -dr com.apple.quarantine "$DIR" 2>/dev/null || true
cat > "$PLIST" <<'PLIST'
${MDM_PLIST}
PLIST
chown root:wheel "$PLIST"
chmod 644 "$PLIST"
# Start it now for whoever is signed in; everyone else gets it at their next login.
CONSOLE_UID=$(stat -f %u /dev/console)
if [ "$CONSOLE_UID" -gt 0 ]; then
  launchctl bootout "gui/$CONSOLE_UID" "$PLIST" 2>/dev/null || true
  launchctl bootstrap "gui/$CONSOLE_UID" "$PLIST" || true
fi
echo "HighPre Agent installed."
`;

const MDM_UNINSTALL_SH = `#!/bin/bash
# Removes HighPre Agent from this Mac for all users. Run as root.
PLIST="/Library/LaunchAgents/in.highpre.agent.plist"
CONSOLE_UID=$(stat -f %u /dev/console)
[ "$CONSOLE_UID" -gt 0 ] && launchctl bootout "gui/$CONSOLE_UID" "$PLIST" 2>/dev/null
rm -f "$PLIST"
rm -rf "/Library/Application Support/HighPre"
for d in /Users/*/Library/Application\\ Support/HighPre; do [ -d "$d" ] && rm -rf "$d"; done
echo "HighPre Agent removed."
`;

const COMPANY_README = (config: CompanyConfig, platform: AgentPlatform) =>
  platform === "windows"
    ? `HighPre Agent company installer for ${config.orgName}

Deploy with Intune, Configuration Manager, PDQ or a sign-in script. Each person
who signs in to a computer gets their own agent, which registers itself and
appears under Desktop agent in the HighPre dashboard with the computer name and
Windows user name.

Microsoft Intune (Win32 app, wrap with IntuneWinAppUtil):
  Install command:    HighPre-Agent-Company-Setup.exe --quiet
  Uninstall command:  "%LOCALAPPDATA%\\HighPre\\highpre-agent.exe" --uninstall --quiet
  Install behaviour:  User
  Detection rule:     Registry, HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\HighPreAgent exists

No administrator rights are needed. The agent updates itself when your HighPre
server has a newer signed build.

Keep this installer inside your organisation: anyone who runs it joins your
HighPre account. Rotate the key in the dashboard if it leaks; existing
computers keep working.
`
    : `HighPre Agent company installer for ${config.orgName}

Deploy with Jamf, Kandji, Mosyle or Intune for macOS by running install.sh as
root (upload this folder as a package payload or script). It installs the agent
for every user of the Mac; each person's agent registers itself the first time
they log in and appears under Desktop agent in the HighPre dashboard.

  sudo ./install.sh     install or update
  sudo ./uninstall.sh   remove for all users

Company installs are updated by redeploying this package. Keep it inside your
organisation: anyone who runs it joins your HighPre account. Rotate the key in
the dashboard if it leaks; existing computers keep working.
`;

/** Builds a company installer for MDM deployment: a zip with the agent, its enrolment config and instructions. */
export async function buildCompanyDownload(platform: DesktopPlatform, config: CompanyConfig): Promise<{ body: Buffer; filename: string; contentType: string }> {
  const binary = await readFile(join(agentDistDir(), AGENT_PLATFORMS[platform].file));
  const folder = "HighPre Agent (company)";
  const entries =
    platform === "windows"
      ? [{ name: `${folder}/HighPre-Agent-Company-Setup.exe`, data: withTrailer(binary, config), mode: 0o755 }]
      : [
          { name: `${folder}/highpre-agent`, data: binary, mode: 0o755 },
          { name: `${folder}/config.json`, data: Buffer.from(JSON.stringify(config, null, 2)), mode: 0o644 },
          { name: `${folder}/install.sh`, data: Buffer.from(MDM_INSTALL_SH), mode: 0o755 },
          { name: `${folder}/uninstall.sh`, data: Buffer.from(MDM_UNINSTALL_SH), mode: 0o755 },
        ];
  entries.push({ name: `${folder}/README.txt`, data: Buffer.from(COMPANY_README(config, platform)), mode: 0o644 });
  const suffix = platform === "windows" ? "Windows" : platform === "mac-arm64" ? "macOS-AppleSilicon" : "macOS-Intel";
  return { body: createZip(entries), filename: `HighPre-Agent-Company-${suffix}.zip`, contentType: "application/zip" };
}

/** Builds the per-device download: an .exe with embedded config, or a macOS zip. */
export async function buildAgentDownload(platform: DesktopPlatform, config: AgentConfig): Promise<{ body: Buffer; filename: string; contentType: string }> {
  const meta = AGENT_PLATFORMS[platform];
  const binary = await readFile(join(agentDistDir(), meta.file));

  if (platform === "windows") {
    return { body: withTrailer(binary, config), filename: meta.download, contentType: "application/vnd.microsoft.portable-executable" };
  }
  const folder = "HighPre Agent";
  const zip = createZip([
    { name: `${folder}/highpre-agent`, data: binary, mode: 0o755 },
    { name: `${folder}/config.json`, data: Buffer.from(JSON.stringify(config, null, 2)), mode: 0o600 },
    { name: `${folder}/Install HighPre Agent.command`, data: Buffer.from(INSTALL_COMMAND), mode: 0o755 },
    { name: `${folder}/Uninstall HighPre Agent.command`, data: Buffer.from(UNINSTALL_COMMAND), mode: 0o755 },
    { name: `${folder}/README.txt`, data: Buffer.from(README(config)), mode: 0o644 },
  ]);
  return { body: zip, filename: meta.download, contentType: "application/zip" };
}
