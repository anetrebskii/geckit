package accept

import (
	"crypto/ecdh"
	"crypto/rand"
	"testing"
	"time"
)

func TestPrepareAcceptRoundTrip(t *testing.T) {
	p := NewPending()
	pub, err := p.Prepare(Request{ID: "r1", Name: "openai-key"})
	if err != nil {
		t.Fatal(err)
	}
	s, err := Seal(pub, []byte("sk-test-value"), InfoSecret)
	if err != nil {
		t.Fatal(err)
	}
	r, v, err := p.Accept("r1", s)
	if err != nil || string(v) != "sk-test-value" || r.Name != "openai-key" {
		t.Fatal(err, string(v))
	}
	if _, _, err := p.Accept("r1", s); err == nil {
		t.Fatal("second accept should fail")
	}
}

func TestWrongInfoFails(t *testing.T) {
	key, _ := ecdh.P256().GenerateKey(rand.Reader)
	s, _ := Seal(b64.EncodeToString(key.PublicKey().Bytes()), []byte("value"), InfoFill)
	if _, err := Open(key, s, InfoSecret); err == nil {
		t.Fatal("info must bind the key")
	}
	if v, err := Open(key, s, InfoFill); err != nil || string(v) != "value" {
		t.Fatal(err)
	}
}

func TestPendingExpires(t *testing.T) {
	now := time.Now()
	p := NewPending()
	p.Now = func() time.Time { return now }
	pub, _ := p.Prepare(Request{ID: "r"})
	s, _ := Seal(pub, []byte("v"), InfoSecret)
	now = now.Add(21 * time.Minute)
	if _, _, err := p.Accept("r", s); err == nil {
		t.Fatal("expired request accepted")
	}
}
