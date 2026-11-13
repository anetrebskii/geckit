//go:build darwin || linux

package main

import (
	"net"
	"os"
	"path/filepath"
	"runtime"

	"golang.org/x/sys/unix"
)

func defaultDir() string {
	home, _ := os.UserHomeDir()
	if runtime.GOOS == "darwin" {
		return filepath.Join(home, "Library", "Application Support", "GeckIt Broker")
	}
	if x := os.Getenv("XDG_DATA_HOME"); x != "" {
		return filepath.Join(x, "geckit-broker")
	}
	return filepath.Join(home, ".local", "share", "geckit-broker")
}

func defaultSocket(dir string) string { return filepath.Join(dir, "broker.sock") }

func listen(path string) (net.Listener, error) {
	_ = os.Remove(path)
	old := unix.Umask(0o177)
	ln, err := net.Listen("unix", path)
	unix.Umask(old)
	if err != nil {
		return nil, err
	}
	return ln, os.Chmod(path, 0o600)
}

func harden() {
	_ = unix.Setrlimit(unix.RLIMIT_CORE, &unix.Rlimit{Cur: 0, Max: 0})
	hardenOS()
}
