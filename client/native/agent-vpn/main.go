package main

import (
	"encoding/json"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/amnezia-vpn/amneziawg-go/v3/conn"
	"github.com/amnezia-vpn/amneziawg-go/v3/device"
)

type transportStatus struct {
	State string `json:"state"`
}

func run(input io.ReadCloser, output io.WriteCloser, status io.Writer, stop <-chan os.Signal) int {
	say := func(state string) { _ = json.NewEncoder(status).Encode(transportStatus{State: state}) }
	finished := make(chan struct{})
	stopping := make(chan struct{})
	defer close(finished)
	defer input.Close()
	defer output.Close()
	go func() {
		select {
		case <-stop:
			close(stopping)
			input.Close()
			output.Close()
		case <-finished:
		}
	}()
	fail := func(state string) int {
		select {
		case <-stopping:
			say("transport_stopped")
			return 0
		default:
			say(state)
			return 1
		}
	}
	text, err := readFrame(input, configLimit)
	if err != nil {
		return fail("invalid_configuration")
	}
	config, err := parseConfig(string(text))
	clear(text)
	if err != nil {
		return fail("invalid_configuration")
	}
	packets := newPacketTun(input, output, config.mtu)
	configured := make(chan struct{})
	packets.configured = configured
	dev := device.NewDevice(packets, conn.NewDefaultBind(), device.NewLogger(device.LogLevelSilent, ""))
	defer dev.Close()
	if err := dev.IpcSet(config.uapi); err != nil {
		return fail("invalid_configuration")
	}
	config.uapi = ""
	if err := dev.Up(); err != nil {
		return fail("transport_failed")
	}
	close(configured)
	select {
	case <-packets.done:
		return fail("packet_stream_closed")
	default:
	}
	say("transport_ready")
	select {
	case <-packets.done:
		return fail("packet_stream_closed")
	case <-dev.Wait():
		return fail("transport_failed")
	case <-stopping:
		say("transport_stopped")
		return 0
	}
}

func main() {
	if len(os.Args) != 1 {
		_ = json.NewEncoder(os.Stderr).Encode(transportStatus{State: "invalid_arguments"})
		os.Exit(1)
	}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	os.Exit(run(os.Stdin, os.Stdout, os.Stderr, stop))
}
