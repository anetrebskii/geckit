package store

import (
	"errors"
	"sync"
)

var (
	ErrNotFound = errors.New("not found")
	ErrLocked   = errors.New("the credential store is locked")
)

type Store interface {
	Put(name string, data []byte) error
	Get(name string) ([]byte, error)
	Delete(name string) error
	Kind() string
}

type Payload struct {
	Value     []byte   `json:"value"`
	Kind      string   `json:"kind"`
	Places    []string `json:"places"`
	Field     string   `json:"field,omitempty"`
	Lifetime  string   `json:"lifetime"`
	ExpiresAt int64    `json:"expiresAt,omitempty"`
	TaskID    string   `json:"taskId,omitempty"`
	UsesLeft  int      `json:"usesLeft,omitempty"`
}

type Memory struct {
	mu    sync.Mutex
	items map[string][]byte
}

func NewMemory() *Memory { return &Memory{items: map[string][]byte{}} }

func (m *Memory) Put(name string, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.items[name] = append([]byte(nil), data...)
	return nil
}

func (m *Memory) Get(name string) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	v, ok := m.items[name]
	if !ok {
		return nil, ErrNotFound
	}
	return append([]byte(nil), v...), nil
}

func (m *Memory) Delete(name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.items, name)
	return nil
}

func (m *Memory) Kind() string { return "memory" }
