package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/anetrebskii/geckit/broker/accept"
	"github.com/anetrebskii/geckit/broker/protocol"
	"github.com/anetrebskii/geckit/broker/secrets"
	"github.com/anetrebskii/geckit/broker/store"
	"github.com/awnumar/memguard"
)

var version = "dev"

func fail(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "geckit-broker: "+format+"\n", a...)
	os.Exit(1)
}

func main() {
	dir := flag.String("dir", defaultDir(), "broker folder")
	socket := flag.String("socket", "", "socket path or pipe name")
	showVersion := flag.Bool("version", false, "print the version")
	flag.Parse()
	if *showVersion {
		fmt.Println(version)
		return
	}
	harden()
	memguard.CatchInterrupt()
	defer memguard.Purge()

	in := bufio.NewReader(os.Stdin)
	token, err := in.ReadString('\n')
	token = strings.TrimSpace(token)
	if token == "" {
		fail("expected a token on the first line of stdin")
	}
	if err := os.MkdirAll(*dir, 0o700); err != nil {
		fail("%v", err)
	}
	_ = os.Chmod(*dir, 0o700)
	st, err := store.Open(*dir)
	if err != nil {
		fail("could not open the credential store: %v", err)
	}
	m, err := secrets.New(st, *dir)
	if err != nil {
		fail("%v", err)
	}
	m.Sweep()
	m.TrimHistory()
	go func() {
		for range time.Tick(time.Minute) {
			m.Sweep()
		}
	}()
	addr := *socket
	if addr == "" {
		addr = defaultSocket(*dir)
	}
	ln, err := listen(addr)
	if err != nil {
		fail("could not listen on %s: %v", addr, err)
	}
	go func() {
		_, _ = io.Copy(io.Discard, in)
		_ = ln.Close()
		memguard.SafeExit(0)
	}()
	fmt.Printf("ready %s\n", addr)
	srv := &protocol.Server{Token: token, Version: version, M: m, P: accept.NewPending()}
	_ = srv.Serve(ln)
	memguard.SafeExit(0)
}
