package main

import (
	"bytes"
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/netip"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/amnezia-vpn/amneziawg-go/v3/conn"
	"github.com/amnezia-vpn/amneziawg-go/v3/device"
	"github.com/amnezia-vpn/amneziawg-go/v3/tun/netstack"
	"golang.org/x/net/dns/dnsmessage"
)

const obfuscation = "jc=2\njmin=10\njmax=20\ns1=16\ns2=20\ns3=16\ns4=16\nh1=101\nh2=102\nh3=103\nh4=104\n"
const nativeObfuscation = "Jc=2\nJmin=10\nJmax=20\nS1=16\nS2=20\nS3=16\nS4=16\nH1=101\nH2=102\nH3=103\nH4=104\n"

func newKey(t *testing.T) *ecdh.PrivateKey {
	t.Helper()
	key, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return key
}

type statusChannel chan string

func (c statusChannel) Write(data []byte) (int, error) {
	var status transportStatus
	if err := json.Unmarshal(data, &status); err != nil {
		return 0, err
	}
	c <- status.State
	return len(data), nil
}

func startClient(t *testing.T, text string) (*netstack.Net, func()) {
	t.Helper()
	clientTun, client, err := netstack.CreateNetTUN([]netip.Addr{netip.MustParseAddr("10.91.0.2"), netip.MustParseAddr("fd91::2")}, []netip.Addr{netip.MustParseAddr("10.91.0.1")}, 1280)
	if err != nil {
		t.Fatal(err)
	}
	input, inputWriter := io.Pipe()
	outputReader, output := io.Pipe()
	status := make(statusChannel, 8)
	stop := make(chan os.Signal, 1)
	exited := make(chan int, 1)
	go func() { exited <- run(input, output, status, stop) }()
	if err := writeFrame(inputWriter, []byte(text)); err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-status:
		if got != "transport_ready" {
			t.Fatalf("transport state: %s", got)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("transport did not start")
	}
	go func() {
		buffer := make([]byte, 65535)
		sizes := make([]int, 1)
		for {
			n, err := clientTun.Read([][]byte{buffer}, sizes, 0)
			if err != nil {
				return
			}
			if n != 1 || writeFrame(inputWriter, buffer[:sizes[0]]) != nil {
				return
			}
		}
	}()
	go func() {
		for {
			packet, err := readFrame(outputReader, 1280)
			if err != nil {
				return
			}
			if _, err := clientTun.Write([][]byte{packet}, 0); err != nil {
				return
			}
		}
	}()
	var once sync.Once
	closeClient := func() {
		once.Do(func() {
			stop <- os.Interrupt
			select {
			case <-exited:
			case <-time.After(5 * time.Second):
				t.Error("transport did not stop")
			}
			clientTun.Close()
			inputWriter.Close()
			outputReader.Close()
		})
	}
	t.Cleanup(closeClient)
	return client, closeClient
}

func TestEncryptedPacketTransport(t *testing.T) {
	for _, version := range []int{1, 2, 3} {
		t.Run(fmt.Sprintf("AWG%d", version), func(t *testing.T) { testEncryptedPacketTransport(t, version) })
	}
}

func testEncryptedPacketTransport(t *testing.T, version int) {
	serverKey, clientKey := newKey(t), newKey(t)
	uapiObfuscation, profileObfuscation := obfuscation, nativeObfuscation
	if version == 1 {
		uapiObfuscation = strings.ReplaceAll(strings.ReplaceAll(obfuscation, "s3=16\n", ""), "s4=16\n", "")
		profileObfuscation = strings.ReplaceAll(strings.ReplaceAll(nativeObfuscation, "S3=16\n", ""), "S4=16\n", "")
	}
	if version == 3 {
		protection := newKey(t).Bytes()
		uapiObfuscation += "header_protection_key=" + hex.EncodeToString(protection) + "\ncontent_padding_addition=8-16\nrandom_trailers=true\n"
		profileObfuscation += "HeaderProtectionKey=" + base64.StdEncoding.EncodeToString(protection) + "\nContentPaddingAddition=8-16\nRandomTrailers=on\n"
	}
	serverTun, server, err := netstack.CreateNetTUN([]netip.Addr{netip.MustParseAddr("10.91.0.1"), netip.MustParseAddr("fd91::1")}, nil, 1280)
	if err != nil {
		t.Fatal(err)
	}
	dev := device.NewDevice(serverTun, conn.NewDefaultBind(), device.NewLogger(device.LogLevelSilent, ""))
	defer dev.Close()
	serverConfig := "private_key=" + hex.EncodeToString(serverKey.Bytes()) + "\n" + uapiObfuscation + "public_key=" + hex.EncodeToString(clientKey.PublicKey().Bytes()) + "\nallowed_ip=10.91.0.2/32\nallowed_ip=fd91::2/128\n"
	if err := dev.IpcSet(serverConfig); err != nil {
		t.Fatal("server configuration failed")
	}
	if err := dev.Up(); err != nil {
		t.Fatal(err)
	}
	state, err := dev.IpcGet()
	if err != nil {
		t.Fatal("server status failed")
	}
	port := ""
	for _, line := range strings.Split(state, "\n") {
		if strings.HasPrefix(line, "listen_port=") {
			port = strings.TrimPrefix(line, "listen_port=")
		}
	}
	if port == "" || port == "0" {
		t.Fatal("server has no transport endpoint")
	}
	for _, ip := range []string{"10.91.0.1", "fd91::1"} {
		listener, err := server.ListenTCPAddrPort(netip.AddrPortFrom(netip.MustParseAddr(ip), 8091))
		if err != nil {
			t.Fatal(err)
		}
		defer listener.Close()
		go func() {
			for {
				connection, err := listener.Accept()
				if err != nil {
					return
				}
				go func() { defer connection.Close(); io.Copy(connection, connection) }()
			}
		}()
		udp, err := server.ListenUDPAddrPort(netip.AddrPortFrom(netip.MustParseAddr(ip), 8092))
		if err != nil {
			t.Fatal(err)
		}
		defer udp.Close()
		go func() {
			buffer := make([]byte, 4096)
			for {
				n, from, err := udp.ReadFrom(buffer)
				if err != nil {
					return
				}
				udp.WriteTo(buffer[:n], from)
			}
		}()
	}
	dns, err := server.ListenUDPAddrPort(netip.MustParseAddrPort("10.91.0.1:53"))
	if err != nil {
		t.Fatal(err)
	}
	defer dns.Close()
	go func() {
		buffer := make([]byte, 4096)
		for {
			n, from, err := dns.ReadFrom(buffer)
			if err != nil {
				return
			}
			var message dnsmessage.Message
			if message.Unpack(buffer[:n]) != nil || len(message.Questions) != 1 {
				continue
			}
			message.Header.Response = true
			if message.Questions[0].Type == dnsmessage.TypeA {
				message.Answers = []dnsmessage.Resource{{Header: dnsmessage.ResourceHeader{Name: message.Questions[0].Name, Type: dnsmessage.TypeA, Class: dnsmessage.ClassINET, TTL: 30}, Body: &dnsmessage.AResource{A: [4]byte{10, 91, 0, 1}}}}
			}
			response, err := message.Pack()
			if err == nil {
				dns.WriteTo(response, from)
			}
		}
	}()
	profile := func(public []byte) string {
		return fmt.Sprintf("[Interface]\nPrivateKey=%s\nAddress=10.91.0.2/32,fd91::2/128\nDNS=10.91.0.1\n%s[Peer]\nPublicKey=%s\nEndpoint=127.0.0.1:%s\nAllowedIPs=0.0.0.0/0,::/0\n", base64.StdEncoding.EncodeToString(clientKey.Bytes()), profileObfuscation, base64.StdEncoding.EncodeToString(public), port)
	}
	for attempt := 0; attempt < 2; attempt++ {
		client, closeClient := startClient(t, profile(serverKey.PublicKey().Bytes()))
		for _, target := range []struct{ network, address string }{{"tcp", "10.91.0.1:8091"}, {"tcp", "[fd91::1]:8091"}, {"udp", "10.91.0.1:8092"}, {"udp", "[fd91::1]:8092"}, {"tcp", "tunnel.test:8091"}} {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			connection, err := client.DialContext(ctx, target.network, target.address)
			cancel()
			if err != nil {
				closeClient()
				t.Fatalf("%s %s: %v", target.network, target.address, err)
			}
			connection.SetDeadline(time.Now().Add(5 * time.Second))
			payload := []byte("encrypted tunnel payload")
			if target.network == "tcp" {
				payload = bytes.Repeat(payload, 256)
			}
			if _, err := connection.Write(payload); err != nil {
				t.Fatal(err)
			}
			got := make([]byte, len(payload))
			_, err = io.ReadFull(connection, got)
			connection.Close()
			if err != nil || !bytes.Equal(got, payload) {
				closeClient()
				t.Fatalf("%s %s echo failed: %v", target.network, target.address, err)
			}
		}
		if attempt == 0 {
			if err := dev.Down(); err != nil {
				t.Fatal(err)
			}
			connection, err := client.DialUDPAddrPort(netip.AddrPort{}, netip.MustParseAddrPort("10.91.0.1:8092"))
			if err != nil {
				t.Fatal(err)
			}
			connection.SetDeadline(time.Now().Add(300 * time.Millisecond))
			connection.Write([]byte("gateway is down"))
			if _, err := connection.Read(make([]byte, 64)); err == nil {
				t.Fatal("down gateway returned traffic")
			}
			connection.Close()
			if err := dev.Up(); err != nil {
				t.Fatal(err)
			}
		}
		closeClient()
	}
	wrong := newKey(t)
	client, closeClient := startClient(t, profile(wrong.PublicKey().Bytes()))
	defer closeClient()
	connection, err := client.DialUDPAddrPort(netip.AddrPort{}, netip.MustParseAddrPort("10.91.0.1:8092"))
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	connection.SetDeadline(time.Now().Add(300 * time.Millisecond))
	connection.Write([]byte("wrong-key payload"))
	if _, err := connection.Read(make([]byte, 64)); err == nil {
		t.Fatal("wrong server key returned tunnel data")
	}
}

func TestPacketPipeFailure(t *testing.T) {
	input, writer := io.Pipe()
	outputReader, outputWriter := io.Pipe()
	packets := newPacketTun(input, outputWriter, 1280)
	defer outputReader.Close()
	go func() { writer.Write([]byte{0, 0, 5, 1}); writer.Close() }()
	_, err := packets.Read([][]byte{make([]byte, 2048)}, make([]int, 1), 0)
	if err != invalidPacket {
		t.Fatalf("oversized frame: %v", err)
	}
	select {
	case <-packets.done:
	default:
		t.Fatal("invalid packet did not close transport")
	}
}

func TestRejectedConfigurationDoesNotExposeSecrets(t *testing.T) {
	for _, text := range []string{"secret-private-key", "[Interface]\nPrivateKey=secret-private-key\nPostUp=curl example.com\n", strings.Repeat("a", configLimit+1)} {
		input, writer := io.Pipe()
		output, outputWriter := io.Pipe()
		var status bytes.Buffer
		go func() { writeFrame(writer, []byte(text)); writer.Close() }()
		if run(input, outputWriter, &status, nil) != 1 {
			t.Fatal("bad configuration succeeded")
		}
		input.Close()
		outputWriter.Close()
		output.Close()
		if status.String() != "{\"state\":\"invalid_configuration\"}\n" {
			t.Fatal("unexpected configuration status")
		}
	}
}

func TestStopBeforeConfiguration(t *testing.T) {
	input, writer := io.Pipe()
	output, outputWriter := io.Pipe()
	defer writer.Close()
	defer output.Close()
	stop := make(chan os.Signal, 1)
	stop <- os.Interrupt
	var status bytes.Buffer
	if code := run(input, outputWriter, &status, stop); code != 0 {
		t.Fatalf("stopped startup returned %d", code)
	}
	if status.String() != "{\"state\":\"transport_stopped\"}\n" {
		t.Fatal("stopped startup reported configuration failure")
	}
}

func TestStopWhileWaitingForDeviceConfiguration(t *testing.T) {
	input, writer := io.Pipe()
	output, outputWriter := io.Pipe()
	defer writer.Close()
	defer output.Close()
	packets := newPacketTun(input, outputWriter, 1280)
	packets.configured = make(chan struct{})
	defer packets.Close()
	exited := make(chan error, 1)
	go func() {
		_, err := packets.Read([][]byte{make([]byte, 2048)}, make([]int, 1), 0)
		exited <- err
	}()
	packets.Close()
	select {
	case err := <-exited:
		if !errors.Is(err, os.ErrClosed) {
			t.Fatal("Stopped startup did not close the pending packet read")
		}
	case <-time.After(time.Second):
		t.Fatal("Stopped startup left the packet reader blocked")
	}
}

func TestOutputPipeFailure(t *testing.T) {
	input, writer := io.Pipe()
	output, outputWriter := io.Pipe()
	defer writer.Close()
	output.Close()
	packets := newPacketTun(input, outputWriter, 1280)
	packet := make([]byte, 20)
	packet[0], packet[3] = 0x45, 20
	if _, err := packets.Write([][]byte{packet}, 0); err == nil {
		t.Fatal("closed output accepted a packet")
	}
	select {
	case <-packets.done:
	default:
		t.Fatal("closed output did not close transport")
	}
}
