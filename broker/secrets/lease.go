package secrets

import (
	"fmt"

	"github.com/anetrebskii/geckit/broker/clean"
	"github.com/anetrebskii/geckit/broker/store"
	"github.com/awnumar/memguard"
)

type Lease struct {
	m      *Manager
	Name   string
	Kind   string
	Places []string
	TaskID string
	Value  *memguard.LockedBuffer
	once   bool
	use    Use
	done   bool
}

func (m *Manager) Acquire(name string, u Use) (*Lease, error) {
	p, err := m.load(name)
	if err != nil {
		if r, ok := err.(*Refusal); ok {
			m.mu.Lock()
			m.record(Record{Name: name, TaskID: u.TaskID, Kind: u.Kind, Place: u.Place, Result: r.Code})
			m.mu.Unlock()
		}
		return nil, err
	}
	l, r := m.check(name, p, u)
	if r != nil {
		memguard.WipeBytes(p.Value)
		m.mu.Lock()
		m.record(Record{Name: name, TaskID: u.TaskID, Kind: u.Kind, Place: u.Place, Result: r.Code})
		m.mu.Unlock()
		if r.Code == "expired" {
			_ = m.remove(name, "expire")
		}
		return nil, r
	}
	return l, nil
}

func (m *Manager) check(name string, p *store.Payload, u Use) (*Lease, *Refusal) {
	if m.expired(p) {
		return nil, refuse("expired", fmt.Sprintf("%s has expired; geckit secrets request %s --replace sends a new link.", name, name))
	}
	if p.Lifetime == "once" && p.UsesLeft < 1 {
		return nil, refuse("expired", fmt.Sprintf("%s was already used once.", name))
	}
	if p.Lifetime == "task" && p.TaskID != u.TaskID {
		return nil, refuse("task", fmt.Sprintf("%s belongs to another task.", name))
	}
	if u.Kind != "" && u.Kind != p.Kind {
		return nil, refuse("place", fmt.Sprintf("%s is a %s secret, not %s.", name, p.Kind, u.Kind))
	}
	if u.Place != "" && !MatchPlace(p.Kind, p.Places, u.Place) {
		if p.Kind == "command" {
			return nil, refuse("program", fmt.Sprintf("%s is for %s, not %s.", name, joinPlaces(p.Places), u.Place))
		}
		return nil, refuse("place", fmt.Sprintf("%s is not allowed for %s.", name, u.Place))
	}
	if p.Kind == "website" && !MatchField(p.Field, u.Field) {
		return nil, refuse("field", fmt.Sprintf("%s can be typed only into a password field or its own field.", name))
	}
	return &Lease{m: m, Name: name, Kind: p.Kind, Places: p.Places, TaskID: p.TaskID, Value: memguard.NewBufferFromBytes(p.Value), once: p.Lifetime == "once", use: u}, nil
}

func joinPlaces(p []string) string {
	s := ""
	for i, x := range p {
		if i > 0 {
			s += ", "
		}
		s += x
	}
	return s
}

func (l *Lease) Done(ok bool, place string) {
	if l.done {
		return
	}
	l.done = true
	l.Value.Destroy()
	if place == "" {
		place = l.use.Place
	}
	result := "ok"
	if !ok {
		result = "failed"
	}
	l.m.mu.Lock()
	l.m.record(Record{Name: l.Name, TaskID: l.use.TaskID, Kind: l.Kind, Place: place, Result: result})
	if x, found := l.m.metas[l.Name]; found && ok {
		x.LastUsedAt = l.m.ms()
		_ = l.m.saveMetas()
	}
	l.m.mu.Unlock()
	if ok && l.once {
		_ = l.m.remove(l.Name, "expire")
	}
}

func (m *Manager) Cleaner() *clean.Cleaner {
	m.mu.Lock()
	if !m.dirty && m.cleaner != nil {
		c := m.cleaner
		m.mu.Unlock()
		return c
	}
	m.mu.Unlock()
	values := map[string][]byte{}
	for _, x := range m.List() {
		if p, err := m.load(x.Name); err == nil {
			values[x.Name] = p.Value
		}
	}
	c := clean.New(values)
	for _, v := range values {
		memguard.WipeBytes(v)
	}
	m.mu.Lock()
	if m.cleaner != nil {
		m.cleaner.Destroy()
	}
	m.cleaner, m.dirty = c, false
	m.mu.Unlock()
	return c
}
