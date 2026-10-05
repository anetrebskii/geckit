package main

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"os"
	"sync"

	"github.com/amnezia-vpn/amneziawg-go/v3/tun"
)

var invalidPacket = errors.New("Invalid packet stream.")

func readFrame(input io.Reader, limit int) ([]byte, error) {
	var header [4]byte
	if _, err := io.ReadFull(input, header[:]); err != nil {
		return nil, err
	}
	size := binary.BigEndian.Uint32(header[:])
	if size == 0 || uint64(size) > uint64(limit) {
		return nil, invalidPacket
	}
	packet := make([]byte, int(size))
	_, err := io.ReadFull(input, packet)
	return packet, err
}

func writeFrame(output io.Writer, packet []byte) error {
	var header [4]byte
	binary.BigEndian.PutUint32(header[:], uint32(len(packet)))
	if _, err := io.Copy(output, io.MultiReader(bytes.NewReader(header[:]), bytes.NewReader(packet))); err != nil {
		return err
	}
	return nil
}

type packetTun struct {
	input      io.ReadCloser
	output     io.WriteCloser
	mtu        int
	events     chan tun.Event
	done       chan struct{}
	once       sync.Once
	write      sync.Mutex
	configured <-chan struct{}
}

func newPacketTun(input io.ReadCloser, output io.WriteCloser, mtu int) *packetTun {
	return &packetTun{input: input, output: output, mtu: mtu, events: make(chan tun.Event), done: make(chan struct{})}
}

func (t *packetTun) File() *os.File           { return nil }
func (t *packetTun) MTU() (int, error)        { return t.mtu, nil }
func (t *packetTun) Name() (string, error)    { return "geckit-packets", nil }
func (t *packetTun) Events() <-chan tun.Event { return t.events }
func (t *packetTun) BatchSize() int           { return 1 }

func (t *packetTun) Read(bufs [][]byte, sizes []int, offset int) (int, error) {
	if t.configured != nil {
		select {
		case <-t.configured:
			t.configured = nil
			// The backend must reload the padding offset chosen before this read.
			return 0, nil
		case <-t.done:
			return 0, os.ErrClosed
		}
	}
	packet, err := readFrame(t.input, t.mtu)
	if err == nil && (!validIP(packet) || len(bufs) == 0 || len(sizes) == 0 || offset < 0 || len(bufs[0])-offset < len(packet)) {
		err = invalidPacket
	}
	if err != nil {
		t.Close()
		return 0, err
	}
	sizes[0] = copy(bufs[0][offset:], packet)
	return 1, nil
}

func (t *packetTun) Write(bufs [][]byte, offset int) (int, error) {
	t.write.Lock()
	defer t.write.Unlock()
	for i, buf := range bufs {
		if offset < 0 || offset > len(buf) || !validIP(buf[offset:]) || len(buf)-offset > t.mtu {
			t.Close()
			return i, invalidPacket
		}
		if err := writeFrame(t.output, buf[offset:]); err != nil {
			t.Close()
			return i, err
		}
	}
	return len(bufs), nil
}

func (t *packetTun) Close() error {
	t.once.Do(func() {
		close(t.done)
		close(t.events)
		t.input.Close()
		t.output.Close()
	})
	return nil
}

func validIP(packet []byte) bool {
	if len(packet) < 20 {
		return false
	}
	switch packet[0] >> 4 {
	case 4:
		header := int(packet[0]&15) * 4
		return header >= 20 && header <= len(packet) && int(binary.BigEndian.Uint16(packet[2:4])) == len(packet)
	case 6:
		return len(packet) >= 40 && int(binary.BigEndian.Uint16(packet[4:6]))+40 == len(packet)
	}
	return false
}
