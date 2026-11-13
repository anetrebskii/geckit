package clean

import (
	"bytes"
	"encoding/base64"
	"encoding/hex"
	"net/url"
	"sort"

	"github.com/awnumar/memguard"
)

const MinLength = 8

type pattern struct {
	buf  *memguard.LockedBuffer
	repl []byte
}

type Cleaner struct {
	pats  []pattern
	max   int
	first map[byte][]int
}

func Encodings(v []byte) [][]byte {
	s := string(v)
	forms := [][]byte{
		v,
		[]byte(base64.StdEncoding.EncodeToString(v)),
		[]byte(base64.RawStdEncoding.EncodeToString(v)),
		[]byte(base64.URLEncoding.EncodeToString(v)),
		[]byte(base64.RawURLEncoding.EncodeToString(v)),
		[]byte(url.QueryEscape(s)),
		[]byte(url.PathEscape(s)),
		[]byte(hex.EncodeToString(v)),
		bytes.ToUpper([]byte(hex.EncodeToString(v))),
	}
	var out [][]byte
	for _, f := range forms {
		dup := false
		for _, o := range out {
			if bytes.Equal(o, f) {
				dup = true
				break
			}
		}
		if !dup {
			out = append(out, f)
		}
	}
	return out
}

func New(values map[string][]byte) *Cleaner {
	c := &Cleaner{}
	for name, v := range values {
		if len(v) < MinLength {
			continue
		}
		repl := []byte("[secret:" + name + "]")
		for _, f := range Encodings(v) {
			c.pats = append(c.pats, pattern{buf: memguard.NewBufferFromBytes(f), repl: repl})
			if len(f) > c.max {
				c.max = len(f)
			}
		}
	}
	sort.Slice(c.pats, func(i, j int) bool { return c.pats[i].buf.Size() > c.pats[j].buf.Size() })
	c.first = map[byte][]int{}
	for k, p := range c.pats {
		b := p.buf.Bytes()[0]
		c.first[b] = append(c.first[b], k)
	}
	return c
}

func (c *Cleaner) scan(b []byte, cut int) ([]byte, []byte) {
	if c == nil || len(c.pats) == 0 {
		return b[:cut], b[cut:]
	}
	out := make([]byte, 0, len(b))
	i := 0
	for i < cut {
		matched := false
		for _, k := range c.first[b[i]] {
			p := c.pats[k].buf.Bytes()
			if len(p) <= len(b)-i && bytes.Equal(b[i:i+len(p)], p) {
				out = append(out, c.pats[k].repl...)
				i += len(p)
				matched = true
				break
			}
		}
		if !matched {
			out = append(out, b[i])
			i++
		}
	}
	return out, b[i:]
}

func (c *Cleaner) Clean(b []byte) []byte {
	out, _ := c.scan(b, len(b))
	return out
}

func (c *Cleaner) Destroy() {
	if c == nil {
		return
	}
	for _, p := range c.pats {
		p.buf.Destroy()
	}
	c.pats = nil
}

type Stream struct {
	c       *Cleaner
	pending []byte
}

func (c *Cleaner) Stream() *Stream { return &Stream{c: c} }

func (s *Stream) Write(chunk []byte) []byte {
	buf := append(s.pending, chunk...)
	keep := 0
	if s.c != nil && s.c.max > 1 {
		keep = s.c.max - 1
	}
	if keep > len(buf) {
		keep = len(buf)
	}
	out, rest := s.c.scan(buf, len(buf)-keep)
	s.pending = append([]byte(nil), rest...)
	return out
}

func (s *Stream) Flush() []byte {
	out := s.c.Clean(s.pending)
	s.pending = nil
	return out
}
