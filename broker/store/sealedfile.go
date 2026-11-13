package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
)

type sealer interface {
	seal(plain []byte) ([]byte, error)
	open(sealed []byte) ([]byte, error)
}

type sealedFiles struct {
	dir  string
	s    sealer
	kind string
}

func fileName(name string) string {
	h := sha256.Sum256([]byte(name))
	return hex.EncodeToString(h[:16]) + ".bin"
}

func (f *sealedFiles) Put(name string, data []byte) error {
	if err := os.MkdirAll(f.dir, 0o700); err != nil {
		return err
	}
	sealed, err := f.s.seal(data)
	if err != nil {
		return err
	}
	path := filepath.Join(f.dir, fileName(name))
	if err := os.WriteFile(path+".new", sealed, 0o600); err != nil {
		return err
	}
	return os.Rename(path+".new", path)
}

func (f *sealedFiles) Get(name string) ([]byte, error) {
	sealed, err := os.ReadFile(filepath.Join(f.dir, fileName(name)))
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return f.s.open(sealed)
}

func (f *sealedFiles) Delete(name string) error {
	err := os.Remove(filepath.Join(f.dir, fileName(name)))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (f *sealedFiles) Kind() string { return f.kind }

type aesSealer struct{ key []byte }

func (a aesSealer) seal(plain []byte) ([]byte, error) {
	block, err := aes.NewCipher(a.key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, plain, nil), nil
}

func (a aesSealer) open(sealed []byte) ([]byte, error) {
	block, err := aes.NewCipher(a.key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(sealed) < gcm.NonceSize() {
		return nil, errors.New("sealed item is too short")
	}
	return gcm.Open(nil, sealed[:gcm.NonceSize()], sealed[gcm.NonceSize():], nil)
}

func NewAESFiles(dir string, key []byte, kind string) Store {
	return &sealedFiles{dir: dir, s: aesSealer{key: key}, kind: kind}
}
