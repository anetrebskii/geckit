package secrets

import (
	"bufio"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

const (
	historyMax = 10000
	historyAge = 90 * 24 * time.Hour
)

type Record struct {
	At     int64  `json:"at"`
	Name   string `json:"name"`
	TaskID string `json:"taskId,omitempty"`
	Kind   string `json:"kind"`
	Place  string `json:"place,omitempty"`
	Result string `json:"result"`
}

func (m *Manager) historyPath() string { return filepath.Join(m.dir, "history.jsonl") }

func (m *Manager) record(r Record) {
	r.At = m.ms()
	b, err := json.Marshal(r)
	if err != nil {
		return
	}
	f, err := os.OpenFile(m.historyPath(), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	_, _ = f.Write(append(b, '\n'))
	_ = f.Close()
}

func (m *Manager) readHistory() []Record {
	b, err := os.ReadFile(m.historyPath())
	if err != nil {
		return nil
	}
	var out []Record
	sc := bufio.NewScanner(bytes.NewReader(b))
	for sc.Scan() {
		var r Record
		if json.Unmarshal(sc.Bytes(), &r) == nil {
			out = append(out, r)
		}
	}
	return out
}

func (m *Manager) History(name string, limit int) []Record {
	m.mu.Lock()
	defer m.mu.Unlock()
	all := m.readHistory()
	if limit <= 0 {
		limit = 100
	}
	var out []Record
	for i := len(all) - 1; i >= 0 && len(out) < limit; i-- {
		if name == "" || all[i].Name == name {
			out = append(out, all[i])
		}
	}
	return out
}

func (m *Manager) TrimHistory() {
	m.mu.Lock()
	defer m.mu.Unlock()
	all := m.readHistory()
	cut := m.Now().Add(-historyAge).UnixMilli()
	start := 0
	for start < len(all) && (all[start].At < cut || len(all)-start > historyMax) {
		start++
	}
	if start == 0 {
		return
	}
	var buf bytes.Buffer
	for _, r := range all[start:] {
		b, _ := json.Marshal(r)
		buf.Write(append(b, '\n'))
	}
	if os.WriteFile(m.historyPath()+".new", buf.Bytes(), 0o600) == nil {
		_ = os.Rename(m.historyPath()+".new", m.historyPath())
	}
}
