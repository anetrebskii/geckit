package accept

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"sync"
	"time"
)

const (
	InfoSecret = "geckit-secret-v1"
	InfoFill   = "geckit-fill-v1"
	pendingTTL = 20 * time.Minute
)

type Sealed struct {
	Epk  string `json:"epk"`
	Iv   string `json:"iv"`
	Data string `json:"data"`
}

var b64 = base64.RawURLEncoding

func decode(s string) ([]byte, error) {
	if b, err := b64.DecodeString(s); err == nil {
		return b, nil
	}
	return base64.URLEncoding.DecodeString(s)
}

func aead(priv *ecdh.PrivateKey, pubRaw []byte, info string) (cipher.AEAD, error) {
	pub, err := ecdh.P256().NewPublicKey(pubRaw)
	if err != nil {
		return nil, err
	}
	shared, err := priv.ECDH(pub)
	if err != nil {
		return nil, err
	}
	key, err := hkdf.Key(sha256.New, shared, nil, info, 32)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func Seal(recipient string, plain []byte, info string) (Sealed, error) {
	pubRaw, err := decode(recipient)
	if err != nil {
		return Sealed{}, errors.New("bad recipient key")
	}
	eph, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return Sealed{}, err
	}
	g, err := aead(eph, pubRaw, info)
	if err != nil {
		return Sealed{}, err
	}
	iv := make([]byte, 12)
	if _, err := rand.Read(iv); err != nil {
		return Sealed{}, err
	}
	return Sealed{Epk: b64.EncodeToString(eph.PublicKey().Bytes()), Iv: b64.EncodeToString(iv), Data: b64.EncodeToString(g.Seal(nil, iv, plain, nil))}, nil
}

func Open(priv *ecdh.PrivateKey, s Sealed, info string) ([]byte, error) {
	epk, err1 := decode(s.Epk)
	iv, err2 := decode(s.Iv)
	data, err3 := decode(s.Data)
	if err1 != nil || err2 != nil || err3 != nil || len(iv) != 12 {
		return nil, errors.New("bad ciphertext")
	}
	g, err := aead(priv, epk, info)
	if err != nil {
		return nil, err
	}
	return g.Open(nil, iv, data, nil)
}

type Request struct {
	ID      string
	Name    string
	Kind    string
	Places  []string
	Field   string
	Note    string
	TaskID  string
	key     *ecdh.PrivateKey
	created time.Time
}

type Pending struct {
	mu  sync.Mutex
	m   map[string]*Request
	Now func() time.Time
}

func NewPending() *Pending { return &Pending{m: map[string]*Request{}, Now: time.Now} }

func (p *Pending) Prepare(r Request) (string, error) {
	key, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return "", err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.drop()
	r.key, r.created = key, p.Now()
	p.m[r.ID] = &r
	return b64.EncodeToString(key.PublicKey().Bytes()), nil
}

func (p *Pending) drop() {
	for id, r := range p.m {
		if p.Now().Sub(r.created) > pendingTTL {
			delete(p.m, id)
		}
	}
}

func (p *Pending) Accept(id string, s Sealed) (*Request, []byte, error) {
	p.mu.Lock()
	p.drop()
	r, ok := p.m[id]
	p.mu.Unlock()
	if !ok {
		return nil, nil, errors.New("unknown or expired request")
	}
	plain, err := Open(r.key, s, InfoSecret)
	if err != nil {
		return nil, nil, err
	}
	p.mu.Lock()
	delete(p.m, id)
	p.mu.Unlock()
	return r, plain, nil
}
