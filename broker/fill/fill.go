package fill

import (
	"github.com/anetrebskii/geckit/broker/accept"
	"github.com/anetrebskii/geckit/broker/secrets"
)

type Request struct {
	Name        string
	TaskID      string
	Origin      string
	Field       string
	EndpointKey string
}

func Fill(m *secrets.Manager, r Request) (accept.Sealed, error) {
	l, err := m.Acquire(r.Name, secrets.Use{TaskID: r.TaskID, Kind: "website", Place: r.Origin, Field: r.Field})
	if err != nil {
		return accept.Sealed{}, err
	}
	s, err := accept.Seal(r.EndpointKey, l.Value.Bytes(), accept.InfoFill)
	l.Done(err == nil, r.Origin)
	return s, err
}
