package sshagent

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"net"
	"testing"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

func TestAgentSignsWithoutExport(t *testing.T) {
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	block, err := ssh.MarshalPrivateKey(priv, "")
	if err != nil {
		t.Fatal(err)
	}
	a, err := Start([][]byte{pem.EncodeToMemory(block)})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	c, err := net.Dial("unix", a.Sock())
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	client := agent.NewClient(c)
	keys, err := client.List()
	if err != nil || len(keys) != 1 {
		t.Fatal(err, len(keys))
	}
	sig, err := client.Sign(keys[0], []byte("data"))
	if err != nil {
		t.Fatal(err)
	}
	pub, _ := ssh.ParsePublicKey(keys[0].Marshal())
	if pub.Verify([]byte("data"), sig) != nil {
		t.Fatal("bad signature")
	}
}
