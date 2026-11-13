package sshagent

import (
	"net"
	"os"
	"path/filepath"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
)

type Agent struct {
	dir  string
	sock string
	ln   net.Listener
	ring agent.Agent
}

func Start(keys [][]byte) (*Agent, error) {
	ring := agent.NewKeyring()
	for _, k := range keys {
		priv, err := ssh.ParseRawPrivateKey(k)
		if err != nil {
			return nil, err
		}
		if err := ring.Add(agent.AddedKey{PrivateKey: priv}); err != nil {
			return nil, err
		}
	}
	dir, err := os.MkdirTemp("", "geckit-ssh-")
	if err != nil {
		return nil, err
	}
	_ = os.Chmod(dir, 0o700)
	sock := filepath.Join(dir, "agent.sock")
	ln, err := net.Listen("unix", sock)
	if err != nil {
		_ = os.RemoveAll(dir)
		return nil, err
	}
	a := &Agent{dir: dir, sock: sock, ln: ln, ring: ring}
	go a.serve()
	return a, nil
}

func (a *Agent) serve() {
	for {
		c, err := a.ln.Accept()
		if err != nil {
			return
		}
		go func() {
			defer c.Close()
			_ = agent.ServeAgent(a.ring, c)
		}()
	}
}

func (a *Agent) Sock() string { return a.sock }

func (a *Agent) Close() {
	_ = a.ln.Close()
	_ = a.ring.RemoveAll()
	_ = os.RemoveAll(a.dir)
}
