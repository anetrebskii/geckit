package protocol

import (
	"bufio"
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net"
	"sync"

	"github.com/anetrebskii/geckit/broker/accept"
	"github.com/anetrebskii/geckit/broker/fill"
	"github.com/anetrebskii/geckit/broker/run"
	"github.com/anetrebskii/geckit/broker/secrets"
)

const Version = 1

const maxLine = 64 << 20

type Request struct {
	Op          string         `json:"op"`
	Token       string         `json:"token,omitempty"`
	Protocol    int            `json:"protocol,omitempty"`
	RequestID   string         `json:"requestId,omitempty"`
	Name        string         `json:"name,omitempty"`
	Kind        string         `json:"kind,omitempty"`
	Places      []string       `json:"places,omitempty"`
	Field       string         `json:"field,omitempty"`
	Note        string         `json:"note,omitempty"`
	TaskID      string         `json:"taskId,omitempty"`
	Ciphertext  *accept.Sealed `json:"ciphertext,omitempty"`
	Lifetime    string         `json:"lifetime,omitempty"`
	All         bool           `json:"all,omitempty"`
	Limit       int            `json:"limit,omitempty"`
	Origin      string         `json:"origin,omitempty"`
	EndpointKey string         `json:"endpointKey,omitempty"`
	Secrets     []string       `json:"secrets,omitempty"`
	Env         []string       `json:"env,omitempty"`
	Argv        []string       `json:"argv,omitempty"`
	Cwd         string         `json:"cwd,omitempty"`
	Text        string         `json:"text,omitempty"`
}

type Server struct {
	Token   string
	Version string
	M       *secrets.Manager
	P       *accept.Pending
}

type writer struct {
	mu sync.Mutex
	w  io.Writer
}

func (w *writer) send(v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	_, err = w.w.Write(append(b, '\n'))
	return err
}

func refusal(err error) map[string]any {
	var r *secrets.Refusal
	if errors.As(err, &r) {
		return map[string]any{"ok": false, "code": r.Code, "say": r.Say}
	}
	return map[string]any{"ok": false, "code": "unknown", "say": "The broker could not do that."}
}

func (s *Server) Serve(ln net.Listener) error {
	for {
		c, err := ln.Accept()
		if err != nil {
			return err
		}
		go s.Handle(c)
	}
}

func (s *Server) Handle(c io.ReadWriteCloser) {
	defer c.Close()
	sc := bufio.NewScanner(c)
	sc.Buffer(make([]byte, 64*1024), maxLine)
	w := &writer{w: c}
	var hello Request
	if !sc.Scan() || json.Unmarshal(sc.Bytes(), &hello) != nil || hello.Op != "hello" {
		_ = w.send(map[string]any{"ok": false, "code": "hello", "say": "Say hello first."})
		return
	}
	if subtle.ConstantTimeCompare([]byte(hello.Token), []byte(s.Token)) != 1 {
		_ = w.send(map[string]any{"ok": false, "code": "token", "say": "Not allowed."})
		return
	}
	if hello.Protocol != Version {
		_ = w.send(map[string]any{"ok": false, "code": "protocol", "protocol": Version})
		return
	}
	_ = w.send(map[string]any{"ok": true, "protocol": Version, "version": s.Version, "store": s.M.Kind()})
	var req Request
	if !sc.Scan() {
		return
	}
	if err := json.Unmarshal(sc.Bytes(), &req); err != nil {
		_ = w.send(map[string]any{"ok": false, "code": "unknown", "say": "The request is not valid JSON."})
		return
	}
	_ = w.send(s.do(req, w))
}

func (s *Server) do(r Request, w *writer) map[string]any {
	switch r.Op {
	case "status":
		return map[string]any{"ok": true, "protocol": Version, "version": s.Version, "store": s.M.Kind(), "locked": s.M.Locked(), "count": len(s.M.List())}
	case "prepare":
		if !secrets.NamePattern.MatchString(r.Name) || !secrets.Kinds[r.Kind] || r.RequestID == "" {
			return map[string]any{"ok": false, "code": "unknown", "say": "The request's name, kind or id is not valid."}
		}
		key, err := s.P.Prepare(accept.Request{ID: r.RequestID, Name: r.Name, Kind: r.Kind, Places: r.Places, Field: r.Field, Note: r.Note, TaskID: r.TaskID})
		if err != nil {
			return refusal(err)
		}
		return map[string]any{"ok": true, "brokerKey": key}
	case "accept":
		if r.Ciphertext == nil {
			return map[string]any{"ok": false, "code": "unknown", "say": "No ciphertext."}
		}
		req, value, err := s.P.Accept(r.RequestID, *r.Ciphertext)
		if err != nil {
			return map[string]any{"ok": false, "code": "expired", "say": "The request is unknown, expired or the value could not be opened."}
		}
		meta, err := s.M.Save(value, secrets.Meta{Name: req.Name, Kind: req.Kind, Places: req.Places, Field: req.Field, Note: req.Note, TaskID: req.TaskID, Lifetime: r.Lifetime, RequestID: req.ID})
		if err != nil {
			return refusal(err)
		}
		out := map[string]any{"ok": true, "name": meta.Name, "secret": meta}
		if meta.ExpiresAt > 0 {
			out["expiresAt"] = meta.ExpiresAt
		}
		return out
	case "list":
		return map[string]any{"ok": true, "secrets": s.M.List()}
	case "history":
		return map[string]any{"ok": true, "records": s.M.History(r.Name, r.Limit)}
	case "revoke":
		var n int
		var err error
		if r.All {
			n, err = s.M.RevokeAll()
		} else {
			n, err = s.M.Revoke(r.Name)
		}
		if err != nil {
			return refusal(err)
		}
		return map[string]any{"ok": true, "removed": n}
	case "taskEnded":
		n, err := s.M.TaskEnded(r.TaskID)
		if err != nil {
			return refusal(err)
		}
		return map[string]any{"ok": true, "removed": n}
	case "fill":
		sealed, err := fill.Fill(s.M, fill.Request{Name: r.Name, TaskID: r.TaskID, Origin: r.Origin, Field: r.Field, EndpointKey: r.EndpointKey})
		if err != nil {
			return refusal(err)
		}
		return map[string]any{"ok": true, "sealed": sealed}
	case "clean":
		return map[string]any{"ok": true, "text": string(s.M.Cleaner().Clean([]byte(r.Text)))}
	case "run":
		code, err := run.Run(context.Background(), s.M, run.Request{TaskID: r.TaskID, Secrets: r.Secrets, Env: r.Env, Argv: r.Argv, Cwd: r.Cwd}, func(stream string, data []byte) {
			_ = w.send(map[string]any{stream: base64.StdEncoding.EncodeToString(data)})
		})
		if err != nil {
			return refusal(err)
		}
		return map[string]any{"ok": true, "exit": code}
	}
	return map[string]any{"ok": false, "code": "unknown", "say": "Unknown operation."}
}
