package proxy

import (
	"crypto/tls"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestPlaceholderReplacedOnlyForAllowedHost(t *testing.T) {
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "auth="+r.Header.Get("Authorization")+" q="+r.URL.Query().Get("k"))
	}))
	defer upstream.Close()
	p, err := Start(func(name, host string) ([]byte, error) {
		if name == "key" && host == "127.0.0.1" {
			return []byte("real-value-123"), nil
		}
		return nil, errors.New(name + " is not allowed for " + host)
	})
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	p.Upstream = upstream.Client().Transport
	pu, _ := url.Parse(p.URL())
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(pu), TLSClientConfig: &tls.Config{RootCAs: p.ca.Pool()}}}

	req, _ := http.NewRequest("GET", upstream.URL+"/?k={{secret:key}}", nil)
	req.Header.Set("Authorization", "Bearer {{secret:key}}")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if string(b) != "auth=Bearer real-value-123 q=real-value-123" {
		t.Fatalf("%d %s", resp.StatusCode, b)
	}

	req, _ = http.NewRequest("GET", upstream.URL+"/", nil)
	req.Header.Set("Authorization", "Bearer {{secret:other}}")
	resp, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	b, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden || string(b) != "geckit: other is not allowed for 127.0.0.1\n" {
		t.Fatalf("%d %s", resp.StatusCode, b)
	}
}
