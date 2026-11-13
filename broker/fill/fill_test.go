package fill

import (
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"testing"

	"github.com/anetrebskii/geckit/broker/accept"
	"github.com/anetrebskii/geckit/broker/secrets"
	"github.com/anetrebskii/geckit/broker/store"
)

func TestFillSealsToEndpoint(t *testing.T) {
	m, _ := secrets.New(store.NewMemory(), t.TempDir())
	if _, err := m.Save([]byte("hunter2-hunter2"), secrets.Meta{Name: "gh", Kind: "website", Places: []string{"https://github.com"}, Lifetime: "keep"}); err != nil {
		t.Fatal(err)
	}
	key, _ := ecdh.P256().GenerateKey(rand.Reader)
	pub := base64.RawURLEncoding.EncodeToString(key.PublicKey().Bytes())
	s, err := Fill(m, Request{Name: "gh", Origin: "https://github.com", Field: "password", EndpointKey: pub})
	if err != nil {
		t.Fatal(err)
	}
	v, err := accept.Open(key, s, accept.InfoFill)
	if err != nil || string(v) != "hunter2-hunter2" {
		t.Fatal(err)
	}
	if _, err := Fill(m, Request{Name: "gh", Origin: "https://gitlab.com", Field: "password", EndpointKey: pub}); err == nil {
		t.Fatal("wrong origin filled")
	}
}
