package main

import (
	"context"
	"io"
	"net/netip"
	"os"
	"os/exec"
	"testing"
	"time"
)

func TestQualificationPeer(t *testing.T) {
	path := os.Getenv("GECKIT_QUALIFICATION_PEER")
	if path == "" {
		t.Skip("Build and select the generated qualification peer.")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	t.Cleanup(cancel)
	command := exec.CommandContext(ctx, path)
	input, err := command.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	output, err := command.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		input.Close()
		exited := make(chan error, 1)
		go func() { exited <- command.Wait() }()
		select {
		case <-exited:
		case <-time.After(5 * time.Second):
			command.Process.Kill()
			<-exited
		}
	})
	profile, err := readFrame(output, configLimit)
	if err != nil {
		t.Fatal("Qualification peer profile unavailable")
	}
	client, _ := startClient(t, string(profile))
	clear(profile)
	connection, err := client.DialUDPAddrPort(netip.AddrPort{}, netip.MustParseAddrPort("10.91.0.1:8092"))
	if err != nil {
		t.Fatal(err)
	}
	connection.SetDeadline(time.Now().Add(5 * time.Second))
	if _, err := connection.Write([]byte("first-udp-probe")); err != nil {
		t.Fatal(err)
	}
	first := make([]byte, len("first-udp-probe"))
	if _, err := io.ReadFull(connection, first); err != nil || string(first) != "first-udp-probe" {
		t.Fatal("First UDP packet did not reach the generated peer")
	}
	connection.Close()
	for _, address := range []string{"10.91.0.1:8091", "tunnel.test:8091", "geckit.tunnel.test:8091", "system-geckit-12345678901234567890123456789012.tunnel.test:8091"} {
		t.Run(address, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			connection, err := client.DialContext(ctx, "tcp", address)
			if err != nil {
				t.Fatal(err)
			}
			defer connection.Close()
			connection.SetDeadline(time.Now().Add(5 * time.Second))
			payload := []byte("geckit-probe")
			if _, err := connection.Write(payload); err != nil {
				t.Fatal(err)
			}
			got := make([]byte, len(payload))
			if _, err := io.ReadFull(connection, got); err != nil || string(got) != string(payload) {
				t.Fatal("Qualification echo failed")
			}
		})
	}
}
