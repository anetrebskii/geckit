package protocol

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"net"
	"strings"
	"testing"

	"github.com/anetrebskii/geckit/broker/accept"
	"github.com/anetrebskii/geckit/broker/secrets"
	"github.com/anetrebskii/geckit/broker/store"
)

func server(t *testing.T) *Server {
	m, err := secrets.New(store.NewMemory(), t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return &Server{Token: "tok", Version: "test", M: m, P: accept.NewPending()}
}

func call(t *testing.T, s *Server, token string, req map[string]any) []map[string]any {
	a, b := net.Pipe()
	go s.Handle(b)
	defer a.Close()
	enc := json.NewEncoder(a)
	go func() {
		_ = enc.Encode(map[string]any{"op": "hello", "token": token, "protocol": 1})
		if req != nil {
			_ = enc.Encode(req)
		}
	}()
	var out []map[string]any
	sc := bufio.NewScanner(a)
	for sc.Scan() {
		var m map[string]any
		if err := json.Unmarshal(sc.Bytes(), &m); err != nil {
			t.Fatal(err)
		}
		out = append(out, m)
	}
	return out
}

func TestWrongTokenRefused(t *testing.T) {
	got := call(t, server(t), "bad", nil)
	if len(got) != 1 || got[0]["code"] != "token" {
		t.Fatal(got)
	}
}

func TestPrepareAcceptListRun(t *testing.T) {
	s := server(t)
	got := call(t, s, "tok", map[string]any{"op": "prepare", "requestId": "r1", "name": "db-pass", "kind": "command", "places": []string{"sh"}, "taskId": "t1"})
	if len(got) != 2 || got[1]["ok"] != true {
		t.Fatal(got)
	}
	sealed, err := accept.Seal(got[1]["brokerKey"].(string), []byte("canary-0123456789"), accept.InfoSecret)
	if err != nil {
		t.Fatal(err)
	}
	got = call(t, s, "tok", map[string]any{"op": "accept", "requestId": "r1", "ciphertext": sealed, "lifetime": "1h"})
	if got[1]["ok"] != true || got[1]["expiresAt"] == nil {
		t.Fatal(got)
	}
	got = call(t, s, "tok", map[string]any{"op": "list"})
	if b, _ := json.Marshal(got); strings.Contains(string(b), "canary") || !strings.Contains(string(b), "db-pass") {
		t.Fatal(string(b))
	}
	got = call(t, s, "tok", map[string]any{"op": "run", "taskId": "t1", "env": []string{"X=secret:db-pass"}, "argv": []string{"sh", "-c", "echo $X"}})
	last := got[len(got)-1]
	if last["ok"] != true || last["exit"].(float64) != 0 {
		t.Fatal(got)
	}
	var printed strings.Builder
	for _, line := range got[1 : len(got)-1] {
		b, _ := base64.StdEncoding.DecodeString(line["out"].(string))
		printed.Write(b)
	}
	if printed.String() != "[secret:db-pass]\n" {
		t.Fatal(printed.String())
	}
	got = call(t, s, "tok", map[string]any{"op": "clean", "text": "x canary-0123456789 y"})
	if got[1]["text"] != "x [secret:db-pass] y" {
		t.Fatal(got)
	}
	got = call(t, s, "tok", map[string]any{"op": "revoke", "name": "db-pass"})
	if got[1]["removed"].(float64) != 1 {
		t.Fatal(got)
	}
}
