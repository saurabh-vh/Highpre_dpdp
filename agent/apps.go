package main

import "strings"

// Risky destinations: AI assistants, chat apps and paste sites. Matching uses
// the foreground process name and window title, locally; only the app key
// (for example "chatgpt") is ever reported, never the title itself.
// Keep keys in sync with src/lib/agent/catalog.ts.

type appRule struct {
	key      string
	patterns []string // matched against lower-cased "process | title"
}

var appRules = []appRule{
	{"chatgpt", []string{"chatgpt", "chat.openai.com", "chatgpt.com"}},
	{"claude", []string{"claude.ai", "claude.exe", "| claude", "claude -", "- claude"}},
	{"gemini", []string{"gemini.google", "google gemini", "gemini -", "- gemini", "| gemini"}},
	{"copilot", []string{"copilot"}},
	{"perplexity", []string{"perplexity"}},
	{"deepseek", []string{"deepseek"}},
	{"meta_ai", []string{"meta ai", "meta.ai"}},
	{"grok", []string{"grok"}},
	{"mistral", []string{"le chat", "chat.mistral"}},
	{"whatsapp", []string{"whatsapp"}},
	{"telegram", []string{"telegram"}},
	{"slack", []string{"slack"}},
	{"discord", []string{"discord"}},
	{"teams", []string{"ms-teams", "microsoft teams", "teams.exe", "| microsoft teams"}},
	{"pastebin", []string{"pastebin"}},
}

// ClassifyApp returns the app key for a foreground window, or "" when it isn't a risky destination.
func ClassifyApp(process, title string) string {
	haystack := strings.ToLower(process + " | " + title)
	for _, rule := range appRules {
		for _, p := range rule.patterns {
			if strings.Contains(haystack, p) {
				return rule.key
			}
		}
	}
	return ""
}

var appLabels = map[string]string{
	"chatgpt": "ChatGPT", "claude": "Claude", "gemini": "Gemini", "copilot": "Copilot", "perplexity": "Perplexity",
	"deepseek": "DeepSeek", "meta_ai": "Meta AI", "grok": "Grok", "mistral": "Le Chat", "whatsapp": "WhatsApp",
	"telegram": "Telegram", "slack": "Slack", "discord": "Discord", "teams": "Microsoft Teams", "pastebin": "Pastebin",
}

var dataLabels = map[string]string{
	"password": "a password", "api_key": "an API key", "private_key": "a private key", "card_number": "a card number",
	"bank_account": "bank account details", "aadhaar": "an Aadhaar number", "pan": "a PAN", "passport": "a passport number",
	"bulk_personal_data": "a list of customer contacts",
}
