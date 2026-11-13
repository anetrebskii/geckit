package store

import (
	"os"
	"testing"
)

func TestKeychainRoundTrip(t *testing.T) {
	if os.Getenv("GECKIT_KEYCHAIN_TEST") == "" {
		t.Skip("set GECKIT_KEYCHAIN_TEST=1 to use the login keychain")
	}
	k := NewKeychain("org.anetrebskii.geckit.broker.test")
	if err := k.Put("smoke", []byte("payload-1")); err != nil {
		t.Fatal(err)
	}
	if err := k.Put("smoke", []byte("payload-2")); err != nil {
		t.Fatal(err)
	}
	b, err := k.Get("smoke")
	if err != nil || string(b) != "payload-2" {
		t.Fatal(err, string(b))
	}
	if err := k.Delete("smoke"); err != nil {
		t.Fatal(err)
	}
	if _, err := k.Get("smoke"); err != ErrNotFound {
		t.Fatal(err)
	}
}
