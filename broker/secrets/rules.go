package secrets

import (
	"net"
	"net/url"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

var NamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,47}$`)

var Lifetimes = map[string]time.Duration{
	"task": 0,
	"once": 0,
	"15m":  15 * time.Minute,
	"1h":   time.Hour,
	"1d":   24 * time.Hour,
	"keep": 0,
}

var Kinds = map[string]bool{"website": true, "http": true, "command": true, "ssh": true}

type Refusal struct {
	Code string
	Say  string
}

func (r *Refusal) Error() string { return r.Say }

func refuse(code, say string) *Refusal { return &Refusal{Code: code, Say: say} }

func origin(s string) string {
	if !strings.Contains(s, "://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil || u.Host == "" {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	port := u.Port()
	scheme := strings.ToLower(u.Scheme)
	if (scheme == "https" && port == "443") || (scheme == "http" && port == "80") {
		port = ""
	}
	if port != "" {
		return scheme + "://" + net.JoinHostPort(host, port)
	}
	return scheme + "://" + host
}

func hostOf(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if strings.Contains(s, "://") {
		if u, err := url.Parse(s); err == nil {
			return u.Hostname()
		}
	}
	if h, _, err := net.SplitHostPort(s); err == nil {
		return h
	}
	return strings.Trim(s, "[]")
}

func MatchPlace(kind string, places []string, place string) bool {
	for _, p := range places {
		switch kind {
		case "website":
			if o := origin(place); o != "" && o == origin(p) {
				return true
			}
		case "http":
			h, want := hostOf(place), strings.ToLower(p)
			if strings.HasPrefix(want, "*.") {
				if strings.HasSuffix(h, want[1:]) && len(h) > len(want)-1 {
					return true
				}
			} else if h == want {
				return true
			}
		case "command":
			if strings.ContainsAny(p, `/\`) {
				if filepath.Clean(place) == filepath.Clean(p) {
					return true
				}
			} else if filepath.Base(place) == p || strings.TrimSuffix(filepath.Base(place), ".exe") == p {
				return true
			}
		case "ssh":
			if ok, _ := path.Match(strings.ToLower(p), strings.ToLower(place)); ok {
				return true
			}
		}
	}
	return false
}

func MatchField(fixed, field string) bool {
	if field == "password" {
		return true
	}
	return fixed != "" && field == fixed
}
