package main

import (
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
	"net/netip"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/amnezia-vpn/amneziawg-go/v3/conn"
	"github.com/amnezia-vpn/amneziawg-go/v3/device"
	"github.com/amnezia-vpn/amneziawg-go/v3/tun"
	"github.com/amnezia-vpn/amneziawg-go/v3/tun/netstack"
	"golang.org/x/net/dns/dnsmessage"
)

const obfuscation = "jc=2\njmin=10\njmax=20\ns1=16\ns2=20\ns3=16\ns4=16\nh1=101\nh2=102\nh3=103\nh4=104\n"
const nativeObfuscation = "Jc=2\nJmin=10\nJmax=20\nS1=16\nS2=20\nS3=16\nS4=16\nH1=101\nH2=102\nH3=103\nH4=104\n"

type observedTun struct {
	tun.Device
	configured chan struct{}
	stopped    chan struct{}
	once       sync.Once
}

func (t *observedTun) Read(buffers [][]byte, sizes []int, offset int) (int, error) {
	if t.configured != nil {
		select {
		case <-t.configured:
			t.configured = nil
			return 0, nil
		case <-t.stopped:
			return 0, os.ErrClosed
		}
	}
	return t.Device.Read(buffers, sizes, offset)
}

func (t *observedTun) Close() error {
	t.once.Do(func() { close(t.stopped) })
	return t.Device.Close()
}

func (t *observedTun) Write(buffers [][]byte, offset int) (int, error) {
	for _, buffer := range buffers {
		if offset < 0 || offset >= len(buffer) {
			continue
		}
		packet := buffer[offset:]
		if len(packet) >= 28 && packet[0]>>4 == 4 && packet[9] == 17 {
			header := int(packet[0]&15) * 4
			if header >= 20 && len(packet) >= header+8 && binary.BigEndian.Uint16(packet[header+2:header+4]) == 53 {
				fmt.Fprintf(os.Stderr, "qualification_dns_packet bytes=%d udp_bytes=%d\n", len(packet), binary.BigEndian.Uint16(packet[header+4:header+6]))
			}
		}
	}
	return t.Device.Write(buffers, offset)
}

func main() {
	if run() != nil {
		fmt.Fprintln(os.Stderr, "qualification_peer_failed")
		os.Exit(1)
	}
}

func run() error {
	serverKey, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		return err
	}
	clientKey, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		return err
	}
	tun, network, err := netstack.CreateNetTUN([]netip.Addr{netip.MustParseAddr("10.91.0.1"), netip.MustParseAddr("fd91::1")}, nil, 1280)
	if err != nil {
		return err
	}
	configured := make(chan struct{})
	observed := &observedTun{Device: tun, configured: configured, stopped: make(chan struct{})}
	dev := device.NewDevice(observed, conn.NewDefaultBind(), device.NewLogger(device.LogLevelSilent, ""))
	defer dev.Close()
	uapi := "private_key=" + hex.EncodeToString(serverKey.Bytes()) + "\n" + obfuscation + "public_key=" + hex.EncodeToString(clientKey.PublicKey().Bytes()) + "\nallowed_ip=10.91.0.2/32\nallowed_ip=fd91::2/128\n"
	if err := dev.IpcSet(uapi); err != nil {
		return err
	}
	if err := dev.Up(); err != nil {
		return err
	}
	close(configured)
	state, err := dev.IpcGet()
	if err != nil {
		return err
	}
	port := 0
	for _, line := range strings.Split(state, "\n") {
		if value, ok := strings.CutPrefix(line, "listen_port="); ok {
			port, err = strconv.Atoi(value)
		}
	}
	if err != nil || port <= 0 || port > 65535 {
		return fmt.Errorf("no endpoint")
	}
	for _, ip := range []string{"10.91.0.1", "fd91::1"} {
		listener, err := network.ListenTCPAddrPort(netip.AddrPortFrom(netip.MustParseAddr(ip), 8091))
		if err != nil {
			return err
		}
		defer listener.Close()
		go func() {
			for {
				connection, err := listener.Accept()
				if err != nil {
					return
				}
				go func() {
					defer connection.Close()
					connection.SetDeadline(time.Now().Add(10 * time.Second))
					io.Copy(connection, connection)
				}()
			}
		}()
		udp, err := network.ListenUDPAddrPort(netip.AddrPortFrom(netip.MustParseAddr(ip), 8092))
		if err != nil {
			return err
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
	dns, err := network.ListenUDPAddrPort(netip.MustParseAddrPort("10.91.0.1:53"))
	if err != nil {
		return err
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
			fmt.Fprintf(os.Stderr, "qualification_dns_received bytes=%d\n", n)
			if message.Unpack(buffer[:n]) != nil || len(message.Questions) != 1 {
				fmt.Fprintln(os.Stderr, "qualification_dns_rejected")
				continue
			}
			message.Header.Response = true
			message.Header.Authoritative = true
			message.Header.RecursionAvailable = true
			name := strings.ToLower(message.Questions[0].Name.String())
			if name != "tunnel.test." && !strings.HasSuffix(name, ".tunnel.test.") {
				message.Header.RCode = dnsmessage.RCodeNameError
			}
			header := dnsmessage.ResourceHeader{Name: message.Questions[0].Name, Type: message.Questions[0].Type, Class: dnsmessage.ClassINET, TTL: 1}
			switch {
			case message.Header.RCode == dnsmessage.RCodeSuccess && message.Questions[0].Type == dnsmessage.TypeA:
				message.Answers = []dnsmessage.Resource{{Header: header, Body: &dnsmessage.AResource{A: [4]byte{10, 91, 0, 1}}}}
			case message.Header.RCode == dnsmessage.RCodeSuccess && message.Questions[0].Type == dnsmessage.TypeAAAA:
				message.Answers = []dnsmessage.Resource{{Header: header, Body: &dnsmessage.AAAAResource{AAAA: netip.MustParseAddr("fd91::1").As16()}}}
			}
			response, err := message.Pack()
			if err == nil {
				dns.WriteTo(response, from)
				fmt.Fprintf(os.Stderr, "qualification_dns_reply type=%d matched=%t\n", message.Questions[0].Type, message.Header.RCode == dnsmessage.RCodeSuccess)
			}
		}
	}()
	profile := fmt.Sprintf("[Interface]\nPrivateKey=%s\nAddress=10.91.0.2/32,fd91::2/128\nDNS=10.91.0.1\n%s[Peer]\nPublicKey=%s\nEndpoint=127.0.0.1:%d\nAllowedIPs=0.0.0.0/0,::/0\n", base64.StdEncoding.EncodeToString(clientKey.Bytes()), nativeObfuscation, base64.StdEncoding.EncodeToString(serverKey.PublicKey().Bytes()), port)
	if err := binary.Write(os.Stdout, binary.BigEndian, uint32(len(profile))); err != nil {
		return err
	}
	if _, err := io.WriteString(os.Stdout, profile); err != nil {
		return err
	}
	fmt.Fprintln(os.Stderr, "qualification_peer_ready")
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(stop)
	closed := make(chan struct{})
	go func() { io.Copy(io.Discard, os.Stdin); close(closed) }()
	select {
	case <-stop:
	case <-closed:
	case <-time.After(10 * time.Minute):
	}
	return nil
}
