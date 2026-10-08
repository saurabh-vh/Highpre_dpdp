package main

import (
	"regexp"
	"strings"
	"unicode"
)

// Local detection of sensitive data in copied text. Runs entirely on the
// device: the text is inspected in memory and discarded. Only the data type
// keys below ever leave the machine. Keep keys in sync with
// src/lib/agent/catalog.ts.

// maxScanBytes caps how much clipboard text is inspected.
const maxScanBytes = 200_000

var (
	rePrivateKey = regexp.MustCompile(`-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----`)
	reAPIKeys    = []*regexp.Regexp{
		regexp.MustCompile(`\bAKIA[0-9A-Z]{16}\b`),                       // AWS access key
		regexp.MustCompile(`\bgh[pousr]_[A-Za-z0-9]{36,}\b`),             // GitHub token
		regexp.MustCompile(`\bgithub_pat_[A-Za-z0-9_]{40,}\b`),           // GitHub fine-grained token
		regexp.MustCompile(`\bsk_live_[0-9A-Za-z]{20,}\b`),               // Stripe
		regexp.MustCompile(`\brzp_live_[A-Za-z0-9]{14,}\b`),              // Razorpay
		regexp.MustCompile(`\bsk-ant-[A-Za-z0-9_\-]{20,}`),               // Anthropic
		regexp.MustCompile(`\bsk-(?:proj-)?[A-Za-z0-9_\-]{32,}`),         // OpenAI
		regexp.MustCompile(`\bAIza[0-9A-Za-z_\-]{35}\b`),                 // Google API key
		regexp.MustCompile(`\bxox[abprs]-[A-Za-z0-9\-]{10,}`),            // Slack
		regexp.MustCompile(`\beyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}`), // JWT
		regexp.MustCompile(`(?i)\b(?:api[_\-]?key|secret[_\-]?key|client[_\-]?secret|access[_\-]?token|auth[_\-]?token)\b\s*["']?\s*[:=]\s*["']?[A-Za-z0-9_\-/+=.]{16,}`),
	}
	rePasswordField = regexp.MustCompile(`(?i)(?:\bpassword|\bpasswd|\bpwd|\bpass\s*code|पासवर्ड)\s*["']?\s*[:=]\s*["']?\S{6,}`)
	reURLCreds      = regexp.MustCompile(`\b[a-z][a-z0-9+.\-]*://[^\s:/@]+:[^\s:/@]{4,}@[^\s/]+`)
	reCardCandidate = regexp.MustCompile(`\b(?:\d[ \-]?){12,18}\d\b`)
	reAadhaar       = regexp.MustCompile(`\b[2-9]\d{3}[ \-]?\d{4}[ \-]?\d{4}\b`)
	rePAN           = regexp.MustCompile(`\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b`)
	reIFSC          = regexp.MustCompile(`\b[A-Z]{4}0[A-Z0-9]{6}\b`)
	reAccountNumber = regexp.MustCompile(`\b\d{9,18}\b`)
	reAccountLabel  = regexp.MustCompile(`(?i)\b(?:a/c|acct|account)\s*(?:no\.?|number|#)?\s*[:\-]?\s*\d{9,18}\b`)
	rePassport      = regexp.MustCompile(`\b[A-PR-WY][1-9]\d ?\d{4}[1-9]\b`)
	rePassportLabel = regexp.MustCompile(`(?i)passport`)
	reEmail         = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)
	reIndianMobile  = regexp.MustCompile(`(?:\+91[ \-]?|\b0)?\b[6-9]\d{9}\b`)
)

// Detect returns the kinds of sensitive data found in text, most serious first.
func Detect(text string) []string {
	if len(text) > maxScanBytes {
		text = text[:maxScanBytes]
	}
	if strings.TrimSpace(text) == "" {
		return nil
	}
	var found []string
	add := func(kind string) { found = append(found, kind) }

	if rePrivateKey.MatchString(text) {
		add("private_key")
	}
	for _, re := range reAPIKeys {
		if re.MatchString(text) {
			add("api_key")
			break
		}
	}
	// A lone token counts as a password only if it isn't already a recognised key.
	if rePasswordField.MatchString(text) || reURLCreds.MatchString(text) || (len(found) == 0 && looksLikeBarePassword(text)) {
		add("password")
	}
	if hasCardNumber(text) {
		add("card_number")
	}
	if (reIFSC.MatchString(text) && reAccountNumber.MatchString(text)) || reAccountLabel.MatchString(text) {
		add("bank_account")
	}
	if hasAadhaar(text) {
		add("aadhaar")
	}
	if rePAN.MatchString(text) {
		add("pan")
	}
	if rePassportLabel.MatchString(text) && rePassport.MatchString(text) {
		add("passport")
	}
	if countDistinct(reEmail.FindAllString(text, 200)) >= 10 || countDistinct(reIndianMobile.FindAllString(text, 200)) >= 10 {
		add("bulk_personal_data")
	}
	return found
}

// looksLikeBarePassword spots a lone copied secret, as copied from a password
// manager: one token, 8–64 characters, mixing at least three character classes.
func looksLikeBarePassword(text string) bool {
	t := strings.TrimSpace(text)
	if len(t) < 8 || len(t) > 64 || strings.ContainsAny(t, " \t\r\n") || strings.Contains(t, "://") || strings.Contains(t, "@") {
		return false
	}
	var lower, upper, digit, symbol bool
	for _, r := range t {
		switch {
		case unicode.IsLower(r):
			lower = true
		case unicode.IsUpper(r):
			upper = true
		case unicode.IsDigit(r):
			digit = true
		case r < 128:
			symbol = true
		default:
			return false // non-ASCII text is a word, not a password
		}
	}
	classes := 0
	for _, b := range []bool{lower, upper, digit, symbol} {
		if b {
			classes++
		}
	}
	// Identifiers like "getUserName" or "Version2" mix classes too; require a symbol or 4 classes.
	return classes >= 3 && (symbol || classes == 4)
}

func digitsOnly(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func hasCardNumber(text string) bool {
	for _, m := range reCardCandidate.FindAllString(text, 50) {
		d := digitsOnly(m)
		if len(d) < 13 || len(d) > 19 || !luhn(d) || !knownCardPrefix(d) {
			continue
		}
		return true
	}
	return false
}

// knownCardPrefix accepts Visa, Mastercard, Amex, Diners, Discover, JCB and RuPay ranges.
func knownCardPrefix(d string) bool {
	for _, p := range []string{"4", "51", "52", "53", "54", "55", "2", "34", "37", "36", "38", "30", "6", "35", "81", "82", "508"} {
		if strings.HasPrefix(d, p) {
			return true
		}
	}
	return false
}

func luhn(d string) bool {
	sum, double := 0, false
	for i := len(d) - 1; i >= 0; i-- {
		n := int(d[i] - '0')
		if double {
			n *= 2
			if n > 9 {
				n -= 9
			}
		}
		sum += n
		double = !double
	}
	return sum%10 == 0
}

func hasAadhaar(text string) bool {
	for _, m := range reAadhaar.FindAllString(text, 50) {
		if d := digitsOnly(m); len(d) == 12 && verhoeff(d) {
			return true
		}
	}
	return false
}

// Verhoeff checksum, used by Aadhaar numbers.
var (
	vD = [10][10]int{
		{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}, {1, 2, 3, 4, 0, 6, 7, 8, 9, 5}, {2, 3, 4, 0, 1, 7, 8, 9, 5, 6},
		{3, 4, 0, 1, 2, 8, 9, 5, 6, 7}, {4, 0, 1, 2, 3, 9, 5, 6, 7, 8}, {5, 9, 8, 7, 6, 0, 4, 3, 2, 1},
		{6, 5, 9, 8, 7, 1, 0, 4, 3, 2}, {7, 6, 5, 9, 8, 2, 1, 0, 4, 3}, {8, 7, 6, 5, 9, 3, 2, 1, 0, 4},
		{9, 8, 7, 6, 5, 4, 3, 2, 1, 0},
	}
	vP = [8][10]int{
		{0, 1, 2, 3, 4, 5, 6, 7, 8, 9}, {1, 5, 7, 6, 2, 8, 3, 0, 9, 4}, {5, 8, 0, 3, 7, 9, 6, 1, 4, 2},
		{8, 9, 1, 6, 0, 4, 3, 5, 2, 7}, {9, 4, 5, 3, 1, 2, 6, 8, 7, 0}, {4, 2, 8, 6, 5, 7, 3, 9, 0, 1},
		{2, 7, 9, 3, 8, 0, 6, 4, 1, 5}, {7, 0, 4, 6, 9, 1, 3, 2, 5, 8},
	}
)

func verhoeff(d string) bool {
	c := 0
	for i := 0; i < len(d); i++ {
		c = vD[c][vP[i%8][int(d[len(d)-1-i]-'0')]]
	}
	return c == 0
}

func countDistinct(items []string) int {
	seen := map[string]struct{}{}
	for _, s := range items {
		seen[strings.ToLower(digitsOnlyOr(s))] = struct{}{}
	}
	return len(seen)
}

// digitsOnlyOr normalises phone numbers to their last 10 digits; emails are kept as is.
func digitsOnlyOr(s string) string {
	if strings.Contains(s, "@") {
		return s
	}
	d := digitsOnly(s)
	if len(d) > 10 {
		d = d[len(d)-10:]
	}
	return d
}
