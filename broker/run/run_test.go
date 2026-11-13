package run

import (
	"context"
	"strings"
	"testing"

	"github.com/anetrebskii/geckit/broker/secrets"
	"github.com/anetrebskii/geckit/broker/store"
)

func TestCommandValueComesBackCleaned(t *testing.T) {
	m, _ := secrets.New(store.NewMemory(), t.TempDir())
	if _, err := m.Save([]byte("canary-7f3c9a2e5b1d"), secrets.Meta{Name: "db", Kind: "command", Places: []string{"sh"}, Lifetime: "keep"}); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Save([]byte("canary-http-0042abcd"), secrets.Meta{Name: "api", Kind: "http", Places: []string{"example.com"}, Lifetime: "keep"}); err != nil {
		t.Fatal(err)
	}
	var out, errOut strings.Builder
	code, err := Run(context.Background(), m, Request{
		Env:  []string{"DB=secret:db", "API=secret:api"},
		Argv: []string{"sh", "-c", `echo "db=$DB api=$API"; echo "$DB" | base64 >&2; test -n "$HTTPS_PROXY"`},
	}, func(stream string, data []byte) {
		if stream == "out" {
			out.Write(data)
		} else {
			errOut.Write(data)
		}
	})
	if err != nil || code != 0 {
		t.Fatal(err, code, out.String())
	}
	if out.String() != "db=[secret:db] api={{secret:api}}\n" || strings.Contains(errOut.String(), "Y2FuYXJ5LTdmM2M5YTJlNWIxZ") {
		t.Fatal(out.String(), errOut.String())
	}
}

func TestCommandSecretRefusedForOtherProgram(t *testing.T) {
	m, _ := secrets.New(store.NewMemory(), t.TempDir())
	_, _ = m.Save([]byte("canary-7f3c9a2e5b1d"), secrets.Meta{Name: "db", Kind: "command", Places: []string{"psql"}, Lifetime: "keep"})
	_, err := Run(context.Background(), m, Request{Env: []string{"DB=secret:db"}, Argv: []string{"sh", "-c", "env"}}, func(string, []byte) {})
	if r, ok := err.(*secrets.Refusal); !ok || r.Code != "program" {
		t.Fatal(err)
	}
}
