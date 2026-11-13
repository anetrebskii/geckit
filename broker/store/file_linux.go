package store

import (
	"bytes"
	"crypto/rand"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
)

func fileKey(dir string) ([]byte, string, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, "", err
	}
	cred := filepath.Join(dir, "key.cred")
	if _, err := exec.LookPath("systemd-creds"); err == nil {
		if _, err := os.Stat(cred); err == nil {
			out, err := exec.Command("systemd-creds", "decrypt", "--user", "--name=geckit-broker", cred, "-").Output()
			if err == nil && len(out) == 32 {
				return out, "file-systemd-creds", nil
			}
			return nil, "", errors.New("systemd-creds could not open the broker key")
		} else if errors.Is(err, os.ErrNotExist) {
			key := make([]byte, 32)
			if _, err := rand.Read(key); err != nil {
				return nil, "", err
			}
			cmd := exec.Command("systemd-creds", "encrypt", "--user", "--name=geckit-broker", "-", cred)
			cmd.Stdin = bytes.NewReader(key)
			if err := cmd.Run(); err == nil {
				_ = os.Chmod(cred, 0o600)
				return key, "file-systemd-creds", nil
			}
			_ = os.Remove(cred)
		}
	}
	path := filepath.Join(dir, "key.bin")
	key, err := os.ReadFile(path)
	if err == nil && len(key) == 32 {
		return key, "file-keyfile", nil
	}
	key = make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, "", err
	}
	if err := os.WriteFile(path, key, 0o600); err != nil {
		return nil, "", err
	}
	return key, "file-keyfile", nil
}

func Open(dir string) (Store, error) {
	if s, err := openSecretService(); err == nil {
		return s, nil
	}
	key, kind, err := fileKey(dir)
	if err != nil {
		return nil, err
	}
	return NewAESFiles(filepath.Join(dir, "items"), key, kind), nil
}
