package secrets

import (
	"testing"
	"time"

	"github.com/anetrebskii/geckit/broker/store"
)

func newManager(t *testing.T) (*Manager, *time.Time) {
	m, err := New(store.NewMemory(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1_800_000_000, 0)
	m.Now = func() time.Time { return now }
	return m, &now
}

func save(t *testing.T, m *Manager, meta Meta, v string) {
	if _, err := m.Save([]byte(v), meta); err != nil {
		t.Fatal(err)
	}
}

func code(err error) string {
	if r, ok := err.(*Refusal); ok {
		return r.Code
	}
	if err != nil {
		return err.Error()
	}
	return ""
}

func TestTimedSecretExpiresAfterSleep(t *testing.T) {
	m, now := newManager(t)
	save(t, m, Meta{Name: "k1", Kind: "http", Places: []string{"api.openai.com"}, Lifetime: "15m"}, "value-123456")
	l, err := m.Acquire("k1", Use{Kind: "http", Place: "api.openai.com"})
	if err != nil {
		t.Fatal(err)
	}
	l.Done(true, "")
	*now = now.Add(20 * time.Minute)
	if _, err := m.Acquire("k1", Use{Kind: "http"}); code(err) != "expired" {
		t.Fatal(err)
	}
	if len(m.List()) != 0 {
		t.Fatal("expired secret kept")
	}
}

func TestOnceIsDeletedAfterSuccess(t *testing.T) {
	m, _ := newManager(t)
	save(t, m, Meta{Name: "once1", Kind: "command", Places: []string{"psql"}, Lifetime: "once"}, "value-123456")
	l, err := m.Acquire("once1", Use{Kind: "command", Place: "/usr/bin/psql"})
	if err != nil {
		t.Fatal(err)
	}
	l.Done(true, "")
	if _, err := m.Acquire("once1", Use{}); code(err) != "unknown" {
		t.Fatal(err)
	}
}

func TestTaskSecret(t *testing.T) {
	m, _ := newManager(t)
	save(t, m, Meta{Name: "t1", Kind: "http", Places: []string{"x.com"}, Lifetime: "task", TaskID: "a"}, "value-123456")
	if _, err := m.Acquire("t1", Use{TaskID: "b"}); code(err) != "task" {
		t.Fatal(err)
	}
	if n, _ := m.TaskEnded("a"); n != 1 {
		t.Fatal("task end did not remove")
	}
}

func TestPlacesAndFields(t *testing.T) {
	m, _ := newManager(t)
	save(t, m, Meta{Name: "gh", Kind: "website", Places: []string{"https://github.com"}, Lifetime: "keep"}, "value-123456")
	if _, err := m.Acquire("gh", Use{Kind: "website", Place: "https://evil.com", Field: "password"}); code(err) != "place" {
		t.Fatal(err)
	}
	if _, err := m.Acquire("gh", Use{Kind: "website", Place: "https://github.com/login", Field: "search"}); code(err) != "field" {
		t.Fatal(err)
	}
	l, err := m.Acquire("gh", Use{Kind: "website", Place: "https://github.com:443/login", Field: "password"})
	if err != nil || string(l.Value.Bytes()) != "value-123456" {
		t.Fatal(err)
	}
	l.Done(true, "")
	if len(m.History("gh", 10)) < 3 {
		t.Fatal("history not recorded")
	}
}

func TestMatchPlace(t *testing.T) {
	cases := []struct {
		kind, place string
		places      []string
		want        bool
	}{
		{"http", "api.stripe.com:443", []string{"*.stripe.com"}, true},
		{"http", "stripe.com", []string{"*.stripe.com"}, false},
		{"http", "evilstripe.com", []string{"*.stripe.com"}, false},
		{"command", "/opt/bin/psql", []string{"psql"}, true},
		{"command", "/opt/bin/psql", []string{"/usr/bin/psql"}, false},
		{"ssh", "github.com", []string{"*.com"}, true},
		{"website", "http://github.com", []string{"https://github.com"}, false},
	}
	for _, c := range cases {
		if MatchPlace(c.kind, c.places, c.place) != c.want {
			t.Errorf("%v", c)
		}
	}
}

func TestCleanerUsesActiveValues(t *testing.T) {
	m, _ := newManager(t)
	save(t, m, Meta{Name: "k2", Kind: "http", Places: []string{"x"}, Lifetime: "keep"}, "value-abcdefgh")
	if got := string(m.Cleaner().Clean([]byte("token=value-abcdefgh"))); got != "token=[secret:k2]" {
		t.Fatal(got)
	}
}
