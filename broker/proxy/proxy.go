package proxy

import (
	"bufio"
	"bytes"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/awnumar/memguard"
)

const maxBody = 64 << 20

var placeholder = regexp.MustCompile(`\{\{secret:([a-z0-9][a-z0-9-]{1,47})\}\}`)

type Resolver func(name, host string) ([]byte, error)

type Proxy struct {
	Resolve  Resolver
	Upstream http.RoundTripper
	ca       *authority
	ln       net.Listener
	srv      *http.Server
}

func Start(resolve Resolver) (*Proxy, error) {
	ca, err := newAuthority()
	if err != nil {
		return nil, err
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		ca.close()
		return nil, err
	}
	p := &Proxy{Resolve: resolve, Upstream: &http.Transport{ForceAttemptHTTP2: true}, ca: ca, ln: ln}
	p.srv = &http.Server{Handler: p}
	go func() { _ = p.srv.Serve(ln) }()
	return p, nil
}

func (p *Proxy) URL() string    { return "http://" + p.ln.Addr().String() }
func (p *Proxy) CAFile() string { return p.ca.file }

func (p *Proxy) Close() {
	_ = p.srv.Close()
	p.ca.close()
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodConnect {
		p.tunnel(w, r)
		return
	}
	if r.URL.Host == "" {
		http.Error(w, "geckit: not a proxy request", http.StatusBadRequest)
		return
	}
	resp := p.forward(r)
	defer resp.Body.Close()
	for k, vs := range resp.Header {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (p *Proxy) tunnel(w http.ResponseWriter, r *http.Request) {
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "geckit: cannot tunnel", http.StatusInternalServerError)
		return
	}
	conn, _, err := hj.Hijack()
	if err != nil {
		return
	}
	defer conn.Close()
	target := r.Host
	host, _, err := net.SplitHostPort(target)
	if err != nil {
		host = target
	}
	if _, err := conn.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n")); err != nil {
		return
	}
	tc := tls.Server(conn, &tls.Config{
		NextProtos: []string{"http/1.1"},
		GetCertificate: func(h *tls.ClientHelloInfo) (*tls.Certificate, error) {
			if h.ServerName != "" {
				return p.ca.leaf(h.ServerName)
			}
			return p.ca.leaf(host)
		},
	})
	if err := tc.Handshake(); err != nil {
		return
	}
	br := bufio.NewReader(tc)
	for {
		req, err := http.ReadRequest(br)
		if err != nil {
			return
		}
		req.URL.Scheme, req.URL.Host = "https", target
		resp := p.forward(req)
		err = resp.Write(tc)
		resp.Body.Close()
		if err != nil || req.Close || resp.Close {
			return
		}
	}
}

func refused(req *http.Request, say string) *http.Response {
	body := "geckit: " + say + "\n"
	return &http.Response{
		StatusCode: http.StatusForbidden, Status: "403 Forbidden", Proto: "HTTP/1.1", ProtoMajor: 1, ProtoMinor: 1,
		Header:        http.Header{"Content-Type": {"text/plain; charset=utf-8"}},
		Body:          io.NopCloser(strings.NewReader(body)),
		ContentLength: int64(len(body)),
		Request:       req,
	}
}

var hop = []string{"Connection", "Proxy-Connection", "Keep-Alive", "Proxy-Authorization", "Te", "Trailer", "Transfer-Encoding", "Upgrade"}

func (p *Proxy) forward(req *http.Request) *http.Response {
	var body []byte
	if req.Body != nil {
		b, err := io.ReadAll(io.LimitReader(req.Body, maxBody))
		req.Body.Close()
		if err != nil {
			return refused(req, "could not read the request body")
		}
		body = b
	}
	rawURL := req.URL.String()
	names := map[string]bool{}
	collect := func(s []byte) {
		for _, m := range placeholder.FindAllSubmatch(s, -1) {
			names[string(m[1])] = true
		}
	}
	collect([]byte(rawURL))
	collect(body)
	for _, vs := range req.Header {
		for _, v := range vs {
			collect([]byte(v))
		}
	}
	host := req.URL.Hostname()
	values := map[string]*memguard.LockedBuffer{}
	defer func() {
		for _, v := range values {
			v.Destroy()
		}
	}()
	for name := range names {
		v, err := p.Resolve(name, host)
		if err != nil {
			return refused(req, err.Error())
		}
		values[name] = memguard.NewBufferFromBytes(v)
	}
	for name, v := range values {
		ph := "{{secret:" + name + "}}"
		rawURL = strings.ReplaceAll(rawURL, ph, string(v.Bytes()))
		body = bytes.ReplaceAll(body, []byte(ph), v.Bytes())
		for k, vs := range req.Header {
			for i := range vs {
				vs[i] = strings.ReplaceAll(vs[i], ph, string(v.Bytes()))
			}
			req.Header[k] = vs
		}
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return refused(req, "the request address is not valid after substitution")
	}
	out := req.Clone(req.Context())
	out.URL, out.RequestURI, out.Host = u, "", u.Host
	out.Body = io.NopCloser(bytes.NewReader(body))
	out.ContentLength = int64(len(body))
	if len(body) == 0 && (req.Method == http.MethodGet || req.Method == http.MethodHead) {
		out.Body = nil
	}
	for _, h := range hop {
		out.Header.Del(h)
	}
	resp, err := p.Upstream.RoundTrip(out)
	memguard.WipeBytes(body)
	if err != nil {
		return refused(req, fmt.Sprintf("could not reach %s", host))
	}
	return resp
}
