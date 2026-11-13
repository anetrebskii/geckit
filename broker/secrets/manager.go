package secrets

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/anetrebskii/geckit/broker/clean"
	"github.com/anetrebskii/geckit/broker/store"
	"github.com/awnumar/memguard"
)

type Meta struct {
	Name           string   `json:"name"`
	Kind           string   `json:"kind"`
	Places         []string `json:"places"`
	Field          string   `json:"field,omitempty"`
	Note           string   `json:"note,omitempty"`
	Lifetime       string   `json:"lifetime"`
	ExpiresAt      int64    `json:"expiresAt,omitempty"`
	TaskID         string   `json:"taskId,omitempty"`
	UsesLeft       int      `json:"usesLeft,omitempty"`
	Cleaned        bool     `json:"cleaned"`
	GivenToProgram bool     `json:"givenToProgram"`
	RequestID      string   `json:"requestId,omitempty"`
	CreatedAt      int64    `json:"createdAt"`
	LastUsedAt     int64    `json:"lastUsedAt,omitempty"`
}

type Use struct {
	TaskID string
	Kind   string
	Place  string
	Field  string
}

type Manager struct {
	st      store.Store
	dir     string
	Now     func() time.Time
	mu      sync.Mutex
	metas   map[string]*Meta
	cleaner *clean.Cleaner
	dirty   bool
}

func New(st store.Store, dir string) (*Manager, error) {
	m := &Manager{st: st, dir: dir, Now: time.Now, metas: map[string]*Meta{}, dirty: true}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	b, err := os.ReadFile(m.metaPath())
	if err == nil {
		var list []*Meta
		if json.Unmarshal(b, &list) == nil {
			for _, x := range list {
				m.metas[x.Name] = x
			}
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	return m, nil
}

func (m *Manager) Kind() string { return m.st.Kind() }

func (m *Manager) Locked() bool {
	_, err := m.st.Get("geckit-broker-probe")
	return errors.Is(err, store.ErrLocked)
}

func (m *Manager) metaPath() string { return filepath.Join(m.dir, "secrets.json") }

func (m *Manager) saveMetas() error {
	list := make([]*Meta, 0, len(m.metas))
	for _, x := range m.metas {
		list = append(list, x)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Name < list[j].Name })
	b, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(m.metaPath()+".new", b, 0o600); err != nil {
		return err
	}
	return os.Rename(m.metaPath()+".new", m.metaPath())
}

func (m *Manager) ms() int64 { return m.Now().UnixMilli() }

func (m *Manager) Save(value []byte, meta Meta) (Meta, error) {
	if !NamePattern.MatchString(meta.Name) || !Kinds[meta.Kind] {
		return Meta{}, refuse("unknown", "The secret's name or kind is not valid.")
	}
	d, ok := Lifetimes[meta.Lifetime]
	if !ok {
		return Meta{}, refuse("unknown", "Unknown lifetime.")
	}
	if meta.Lifetime == "task" && meta.TaskID == "" {
		return Meta{}, refuse("task", "A This task secret needs its task.")
	}
	now := m.ms()
	meta.CreatedAt, meta.LastUsedAt, meta.ExpiresAt, meta.UsesLeft = now, 0, 0, 0
	if d > 0 {
		meta.ExpiresAt = now + d.Milliseconds()
	}
	if meta.Lifetime == "once" {
		meta.UsesLeft = 1
	}
	meta.Cleaned = len(value) >= clean.MinLength
	meta.GivenToProgram = meta.Kind == "command"
	p := store.Payload{Value: value, Kind: meta.Kind, Places: meta.Places, Field: meta.Field, Lifetime: meta.Lifetime, ExpiresAt: meta.ExpiresAt, TaskID: meta.TaskID, UsesLeft: meta.UsesLeft}
	b, err := json.Marshal(p)
	memguard.WipeBytes(value)
	if err != nil {
		return Meta{}, err
	}
	err = m.st.Put(meta.Name, b)
	memguard.WipeBytes(b)
	if err != nil {
		return Meta{}, err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.metas[meta.Name] = &meta
	m.dirty = true
	m.record(Record{Name: meta.Name, TaskID: meta.TaskID, Kind: "save", Result: "ok"})
	return meta, m.saveMetas()
}

func (m *Manager) load(name string) (*store.Payload, error) {
	b, err := m.st.Get(name)
	if errors.Is(err, store.ErrNotFound) {
		return nil, refuse("unknown", fmt.Sprintf("There is no secret %s.", name))
	}
	if errors.Is(err, store.ErrLocked) {
		return nil, refuse("locked", "The credential store is locked; unlock it and try again.")
	}
	if err != nil {
		return nil, err
	}
	var p store.Payload
	err = json.Unmarshal(b, &p)
	memguard.WipeBytes(b)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (m *Manager) expired(p *store.Payload) bool {
	return p.ExpiresAt > 0 && m.ms() >= p.ExpiresAt
}

func (m *Manager) List() []Meta {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Meta, 0, len(m.metas))
	for _, x := range m.metas {
		out = append(out, *x)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func (m *Manager) Peek(name string) (Meta, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	x, ok := m.metas[name]
	if !ok {
		return Meta{}, false
	}
	return *x, true
}

func (m *Manager) remove(name, why string) error {
	if err := m.st.Delete(name); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.metas[name]; ok {
		delete(m.metas, name)
		m.dirty = true
		m.record(Record{Name: name, Kind: why, Result: "ok"})
	}
	return m.saveMetas()
}

func (m *Manager) Revoke(name string) (int, error) {
	if _, ok := m.Peek(name); !ok {
		return 0, nil
	}
	return 1, m.remove(name, "revoke")
}

func (m *Manager) RevokeAll() (int, error) {
	n := 0
	for _, x := range m.List() {
		if err := m.remove(x.Name, "revoke"); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

func (m *Manager) TaskEnded(taskID string) (int, error) {
	n := 0
	for _, x := range m.List() {
		if x.Lifetime == "task" && x.TaskID == taskID {
			if err := m.remove(x.Name, "expire"); err != nil {
				return n, err
			}
			n++
		}
	}
	return n, nil
}

func (m *Manager) Sweep() int {
	n := 0
	for _, x := range m.List() {
		p, err := m.load(x.Name)
		var r *Refusal
		if errors.As(err, &r) && r.Code == "unknown" {
			_ = m.remove(x.Name, "expire")
			n++
			continue
		}
		if err != nil {
			continue
		}
		gone := m.expired(p)
		memguard.WipeBytes(p.Value)
		if gone && m.remove(x.Name, "expire") == nil {
			n++
		}
	}
	return n
}
