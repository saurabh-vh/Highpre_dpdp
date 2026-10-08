/**
 * What the desktop agent may report. The agent sends only these keys — never
 * the copied text, a hash of it, or window titles — and the server rejects
 * anything else, so content can't reach HighPre even by mistake.
 * Keep in sync with agent/detect.go and agent/apps.go.
 */

export const AGENT_DATA_TYPES = {
  password: { label: "Password", phrase: "a password", severity: "high" },
  api_key: { label: "API key or access token", phrase: "an API key", severity: "high" },
  private_key: { label: "Private key", phrase: "a private key", severity: "high" },
  card_number: { label: "Payment card number", phrase: "a card number", severity: "high" },
  bank_account: { label: "Bank account details", phrase: "bank account details", severity: "high" },
  aadhaar: { label: "Aadhaar number", phrase: "an Aadhaar number", severity: "high" },
  pan: { label: "PAN", phrase: "a PAN", severity: "medium" },
  passport: { label: "Passport number", phrase: "a passport number", severity: "medium" },
  bulk_personal_data: { label: "List of customer contacts", phrase: "a list of customer contacts", severity: "medium" },
} as const;

export type AgentDataType = keyof typeof AGENT_DATA_TYPES;
export const AGENT_DATA_TYPE_KEYS = Object.keys(AGENT_DATA_TYPES) as [AgentDataType, ...AgentDataType[]];

export const AGENT_APPS = {
  chatgpt: { label: "ChatGPT", category: "ai" },
  claude: { label: "Claude", category: "ai" },
  gemini: { label: "Gemini", category: "ai" },
  copilot: { label: "Microsoft Copilot", category: "ai" },
  perplexity: { label: "Perplexity", category: "ai" },
  deepseek: { label: "DeepSeek", category: "ai" },
  meta_ai: { label: "Meta AI", category: "ai" },
  grok: { label: "Grok", category: "ai" },
  mistral: { label: "Mistral Le Chat", category: "ai" },
  whatsapp: { label: "WhatsApp", category: "chat" },
  telegram: { label: "Telegram", category: "chat" },
  slack: { label: "Slack", category: "chat" },
  discord: { label: "Discord", category: "chat" },
  teams: { label: "Microsoft Teams", category: "chat" },
  pastebin: { label: "Pastebin", category: "sharing" },
} as const;

export type AgentApp = keyof typeof AGENT_APPS;
export const AGENT_APP_KEYS = Object.keys(AGENT_APPS) as [AgentApp, ...AgentApp[]];

export const AGENT_PLATFORMS = {
  windows: { label: "Windows", file: "highpre-agent-windows-amd64.exe", download: "HighPre-Agent-Setup.exe" },
  "mac-arm64": { label: "macOS (Apple silicon)", file: "highpre-agent-darwin-arm64", download: "HighPre-Agent-macOS-AppleSilicon.zip" },
  "mac-intel": { label: "macOS (Intel)", file: "highpre-agent-darwin-amd64", download: "HighPre-Agent-macOS-Intel.zip" },
  browser: { label: "Chrome or Edge extension", file: "", download: "HighPre-Browser-Extension.zip" },
} as const;

export type AgentPlatform = keyof typeof AGENT_PLATFORMS;
export const AGENT_PLATFORM_KEYS = Object.keys(AGENT_PLATFORMS) as [AgentPlatform, ...AgentPlatform[]];
export const isAgentPlatform = (v: string): v is AgentPlatform => v in AGENT_PLATFORMS;
/** Platforms with a native agent binary (everything except the browser extension). */
export type DesktopPlatform = Exclude<AgentPlatform, "browser">;
export const isDesktopPlatform = (v: string): v is DesktopPlatform => isAgentPlatform(v) && v !== "browser";

/** Sites the browser extension watches, by hostname. Keep in sync with extension/sites.js. */
export const EXTENSION_SITES: Record<string, AgentApp> = {
  "chatgpt.com": "chatgpt",
  "chat.openai.com": "chatgpt",
  "claude.ai": "claude",
  "gemini.google.com": "gemini",
  "copilot.microsoft.com": "copilot",
  "www.perplexity.ai": "perplexity",
  "perplexity.ai": "perplexity",
  "chat.deepseek.com": "deepseek",
  "www.meta.ai": "meta_ai",
  "grok.com": "grok",
  "chat.mistral.ai": "mistral",
  "web.whatsapp.com": "whatsapp",
  "web.telegram.org": "telegram",
  "app.slack.com": "slack",
  "discord.com": "discord",
  "teams.microsoft.com": "teams",
  "teams.live.com": "teams",
  "pastebin.com": "pastebin",
};

/** Where a detection came from, and what the person did about it. */
export const ALERT_SOURCES = ["agent", "extension"] as const;
export const ALERT_OUTCOMES = {
  warned: "Warned",
  stopped: "Didn't paste",
  blocked: "Blocked",
  sent_anyway: "Continued anyway",
  not_sensitive: "Said not sensitive",
} as const;
export type AlertOutcome = keyof typeof ALERT_OUTCOMES;
export const ALERT_OUTCOME_KEYS = Object.keys(ALERT_OUTCOMES) as [AlertOutcome, ...AlertOutcome[]];

export const dataTypeLabel = (key: string) => AGENT_DATA_TYPES[key as AgentDataType]?.label ?? key;
export const appLabel = (key: string) => AGENT_APPS[key as AgentApp]?.label ?? key;
export const appCategoryLabel = (key: string) =>
  ({ ai: "AI assistant", chat: "Chat app", sharing: "Paste or sharing site" })[AGENT_APPS[key as AgentApp]?.category ?? ""] ?? "App";
