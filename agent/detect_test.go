package main

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"
)

// The same cases run against the browser extension's detector
// (extension/detect.js, tests/extension.test.ts), so both behave alike.
func TestDetect(t *testing.T) {
	data, err := os.ReadFile("testdata/detect_cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name string   `json:"name"`
		Text string   `json:"text"`
		Want []string `json:"want"`
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			got := Detect(c.Text)
			if len(got) == 0 && len(c.Want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, c.Want) {
				t.Fatalf("Detect(%q) = %v, want %v", c.Text, got, c.Want)
			}
		})
	}
}

func TestBulkContacts(t *testing.T) {
	var b strings.Builder
	for i := 0; i < 12; i++ {
		b.WriteString("customer")
		b.WriteByte(byte('a' + i))
		b.WriteString("@mail.in, ")
	}
	if got := Detect(b.String()); !reflect.DeepEqual(got, []string{"bulk_personal_data"}) {
		t.Fatalf("got %v", got)
	}
}

func TestClassifyApp(t *testing.T) {
	cases := map[[2]string]string{
		{"chrome.exe", "ChatGPT - Google Chrome"}:           "chatgpt",
		{"msedge.exe", "Claude - Microsoft Edge"}:           "claude",
		{"Claude.exe", ""}:                                  "claude",
		{"Google Chrome", "Google Gemini"}:                  "gemini",
		{"WhatsApp.exe", "WhatsApp"}:                        "whatsapp",
		{"ms-teams.exe", "Chat | Microsoft Teams"}:          "teams",
		{"winword.exe", "Quarterly report - Word"}:          "",
		{"chrome.exe", "Inbox (3) - priya@acme.in - Gmail"}: "",
		{"OUTLOOK.EXE", "Inbox - Outlook"}:                  "",
		{"chrome.exe", "NotebookLM - Google Chrome"}:        "notebooklm",
		{"msedge.exe", "Poe - Fast AI Chat | poe.com"}:      "poe",
		{"chrome.exe", "The Raven by Edgar Allan Poe"}:      "",
	}
	for in, want := range cases {
		if got := ClassifyApp(in[0], in[1]); got != want {
			t.Errorf("ClassifyApp(%q, %q) = %q, want %q", in[0], in[1], got, want)
		}
	}
}

func TestEveryKeyHasALabel(t *testing.T) {
	for _, r := range appRules {
		if appLabels[r.key] == "" {
			t.Errorf("app %s has no label", r.key)
		}
	}
	for _, k := range []string{"password", "api_key", "private_key", "card_number", "bank_account", "aadhaar", "pan", "passport", "bulk_personal_data"} {
		if dataLabels[k] == "" {
			t.Errorf("data type %s has no label", k)
		}
	}
}
