package run

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"

	"github.com/anetrebskii/geckit/broker/proxy"
	"github.com/anetrebskii/geckit/broker/secrets"
	"github.com/anetrebskii/geckit/broker/sshagent"
)

type Request struct {
	TaskID  string
	Secrets []string
	Env     []string
	Argv    []string
	Cwd     string
}

type Emit func(stream string, data []byte)

type session struct {
	m      *secrets.Manager
	req    Request
	leases map[string]*secrets.Lease
	hosts  map[string]bool
}

func (s *session) acquire(name, kind, place string) (*secrets.Lease, error) {
	if l, ok := s.leases[name]; ok {
		return l, nil
	}
	l, err := s.m.Acquire(name, secrets.Use{TaskID: s.req.TaskID, Kind: kind, Place: place})
	if err != nil {
		return nil, err
	}
	s.leases[name] = l
	return l, nil
}

func (s *session) done(ok bool) {
	for _, l := range s.leases {
		l.Done(ok, "")
	}
}

func Run(ctx context.Context, m *secrets.Manager, req Request, emit Emit) (int, error) {
	if len(req.Argv) == 0 {
		return -1, &secrets.Refusal{Code: "unknown", Say: "Nothing to run."}
	}
	s := &session{m: m, req: req, leases: map[string]*secrets.Lease{}, hosts: map[string]bool{}}
	env := os.Environ()
	var httpNames, sshNames []string
	add := func(name string) error {
		meta, ok := m.Peek(name)
		if !ok {
			return &secrets.Refusal{Code: "unknown", Say: fmt.Sprintf("There is no secret %s.", name)}
		}
		switch meta.Kind {
		case "http":
			httpNames = append(httpNames, name)
		case "ssh":
			sshNames = append(sshNames, name)
		case "website":
			return &secrets.Refusal{Code: "place", Say: fmt.Sprintf("%s is for a website; use geckit browser type --secret.", name)}
		}
		return nil
	}
	for _, name := range req.Secrets {
		if err := add(name); err != nil {
			return -1, err
		}
	}
	for _, e := range req.Env {
		k, v, ok := strings.Cut(e, "=")
		if !ok {
			continue
		}
		name, isSecret := strings.CutPrefix(v, "secret:")
		if !isSecret {
			env = append(env, e)
			continue
		}
		meta, found := m.Peek(name)
		if !found {
			return -1, &secrets.Refusal{Code: "unknown", Say: fmt.Sprintf("There is no secret %s.", name)}
		}
		switch meta.Kind {
		case "command":
			l, err := s.acquire(name, "command", req.Argv[0])
			if err != nil {
				s.done(false)
				return -1, err
			}
			env = append(env, k+"="+string(l.Value.Bytes()))
		case "http":
			if err := add(name); err != nil {
				return -1, err
			}
			env = append(env, k+"={{secret:"+name+"}}")
		default:
			return -1, &secrets.Refusal{Code: "place", Say: fmt.Sprintf("%s is a %s secret and cannot go into the environment.", name, meta.Kind)}
		}
	}
	for _, name := range httpNames {
		if _, err := s.acquire(name, "http", ""); err != nil {
			s.done(false)
			return -1, err
		}
	}
	var keys [][]byte
	for _, name := range sshNames {
		l, err := s.acquire(name, "ssh", "")
		if err != nil {
			s.done(false)
			return -1, err
		}
		keys = append(keys, l.Value.Bytes())
	}
	if len(httpNames) > 0 {
		p, err := proxy.Start(s.resolve)
		if err != nil {
			s.done(false)
			return -1, err
		}
		defer p.Close()
		for _, k := range []string{"HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"} {
			env = append(env, k+"="+p.URL())
		}
		for _, k := range []string{"SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE", "GIT_SSL_CAINFO"} {
			env = append(env, k+"="+p.CAFile())
		}
		env = append(env, "NO_PROXY=", "no_proxy=")
	}
	if len(keys) > 0 {
		a, err := sshagent.Start(keys)
		if err != nil {
			s.done(false)
			return -1, err
		}
		defer a.Close()
		env = append(env, "SSH_AUTH_SOCK="+a.Sock())
	}
	code, err := execute(ctx, m, req, env, emit)
	s.done(err == nil && code == 0)
	return code, err
}

func (s *session) resolve(name, host string) ([]byte, error) {
	l, ok := s.leases[name]
	if !ok || l.Kind != "http" {
		return nil, errors.New(name + " was not given to this command")
	}
	if !secrets.MatchPlace("http", l.Places, host) {
		return nil, errors.New(name + " is not allowed for " + host)
	}
	return append([]byte(nil), l.Value.Bytes()...), nil
}

func execute(ctx context.Context, m *secrets.Manager, req Request, env []string, emit Emit) (int, error) {
	cmd := exec.CommandContext(ctx, req.Argv[0], req.Argv[1:]...)
	cmd.Dir, cmd.Env = req.Cwd, env
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return -1, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return -1, err
	}
	if err := cmd.Start(); err != nil {
		return -1, &secrets.Refusal{Code: "unknown", Say: fmt.Sprintf("Could not start %s.", req.Argv[0])}
	}
	c := m.Cleaner()
	var mu sync.Mutex
	var wg sync.WaitGroup
	pump := func(r io.Reader, stream string) {
		defer wg.Done()
		st := c.Stream()
		buf := make([]byte, 32*1024)
		for {
			n, err := r.Read(buf)
			if n > 0 {
				if out := st.Write(buf[:n]); len(out) > 0 {
					mu.Lock()
					emit(stream, out)
					mu.Unlock()
				}
			}
			if err != nil {
				break
			}
		}
		if out := st.Flush(); len(out) > 0 {
			mu.Lock()
			emit(stream, out)
			mu.Unlock()
		}
	}
	wg.Add(2)
	go pump(stdout, "out")
	go pump(stderr, "err")
	wg.Wait()
	err = cmd.Wait()
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return exit.ExitCode(), nil
	}
	if err != nil {
		return -1, err
	}
	return 0, nil
}
