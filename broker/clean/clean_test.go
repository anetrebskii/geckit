package clean

import (
	"bytes"
	"encoding/base64"
	"encoding/hex"
	"net/url"
	"strings"
	"testing"
)

const canary = "canary-7f3c/9a2e+5b1d?x=1"

func TestCleansEveryEncoding(t *testing.T) {
	c := New(map[string][]byte{"key1": []byte(canary)})
	defer c.Destroy()
	for _, form := range []string{
		canary,
		base64.StdEncoding.EncodeToString([]byte(canary)),
		base64.RawURLEncoding.EncodeToString([]byte(canary)),
		url.QueryEscape(canary),
		url.PathEscape(canary),
		hex.EncodeToString([]byte(canary)),
		strings.ToUpper(hex.EncodeToString([]byte(canary))),
	} {
		got := string(c.Clean([]byte("a " + form + " b")))
		if got != "a [secret:key1] b" {
			t.Fatalf("%q -> %q", form, got)
		}
	}
}

func TestShortValuesAreSkipped(t *testing.T) {
	c := New(map[string][]byte{"pin": []byte("1234")})
	if got := string(c.Clean([]byte("1234"))); got != "1234" {
		t.Fatal(got)
	}
}

func TestStreamAcrossChunks(t *testing.T) {
	c := New(map[string][]byte{"key1": []byte(canary)})
	text := []byte("start " + canary + " middle " + base64.StdEncoding.EncodeToString([]byte(canary)) + " end")
	for size := 1; size < 12; size++ {
		s := c.Stream()
		var out bytes.Buffer
		for i := 0; i < len(text); i += size {
			end := i + size
			if end > len(text) {
				end = len(text)
			}
			out.Write(s.Write(text[i:end]))
		}
		out.Write(s.Flush())
		if strings.Contains(out.String(), "canary") || out.String() != "start [secret:key1] middle [secret:key1] end" {
			t.Fatalf("size %d: %q", size, out.String())
		}
	}
}
