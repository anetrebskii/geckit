package store

import (
	"errors"

	"github.com/godbus/dbus/v5"
)

const (
	ssDest    = "org.freedesktop.secrets"
	ssPath    = dbus.ObjectPath("/org/freedesktop/secrets")
	ssService = "org.freedesktop.Secret.Service"
	ssItem    = "org.freedesktop.Secret.Item"
	ssColl    = "org.freedesktop.Secret.Collection"
)

type ssSecret struct {
	Session     dbus.ObjectPath
	Parameters  []byte
	Value       []byte
	ContentType string
}

type SecretService struct {
	conn       *dbus.Conn
	session    dbus.ObjectPath
	collection dbus.ObjectPath
}

func openSecretService() (*SecretService, error) {
	conn, err := dbus.SessionBus()
	if err != nil {
		return nil, err
	}
	svc := conn.Object(ssDest, ssPath)
	var out dbus.Variant
	var session dbus.ObjectPath
	if err := svc.Call(ssService+".OpenSession", 0, "plain", dbus.MakeVariant("")).Store(&out, &session); err != nil {
		return nil, err
	}
	var coll dbus.ObjectPath
	if err := svc.Call(ssService+".ReadAlias", 0, "default").Store(&coll); err != nil || coll == "/" {
		coll = "/org/freedesktop/secrets/aliases/default"
	}
	return &SecretService{conn: conn, session: session, collection: coll}, nil
}

func (s *SecretService) attrs(name string) map[string]string {
	return map[string]string{"application": "geckit-broker", "name": name}
}

func (s *SecretService) unlock(paths []dbus.ObjectPath) error {
	var unlocked []dbus.ObjectPath
	var prompt dbus.ObjectPath
	if err := s.conn.Object(ssDest, ssPath).Call(ssService+".Unlock", 0, paths).Store(&unlocked, &prompt); err != nil {
		return err
	}
	if prompt != "/" {
		return ErrLocked
	}
	return nil
}

func (s *SecretService) find(name string) (dbus.ObjectPath, error) {
	var unlocked, locked []dbus.ObjectPath
	if err := s.conn.Object(ssDest, ssPath).Call(ssService+".SearchItems", 0, s.attrs(name)).Store(&unlocked, &locked); err != nil {
		return "", err
	}
	if len(unlocked) > 0 {
		return unlocked[0], nil
	}
	if len(locked) > 0 {
		if err := s.unlock(locked[:1]); err != nil {
			return "", err
		}
		return locked[0], nil
	}
	return "", ErrNotFound
}

func (s *SecretService) Put(name string, data []byte) error {
	if err := s.unlock([]dbus.ObjectPath{s.collection}); err != nil {
		return err
	}
	props := map[string]dbus.Variant{
		ssItem + ".Label":      dbus.MakeVariant("GeckIt secret " + name),
		ssItem + ".Attributes": dbus.MakeVariant(s.attrs(name)),
	}
	secret := ssSecret{Session: s.session, Parameters: []byte{}, Value: data, ContentType: "application/octet-stream"}
	var item, prompt dbus.ObjectPath
	if err := s.conn.Object(ssDest, s.collection).Call(ssColl+".CreateItem", 0, props, secret, true).Store(&item, &prompt); err != nil {
		return err
	}
	if prompt != "/" {
		return ErrLocked
	}
	return nil
}

func (s *SecretService) Get(name string) ([]byte, error) {
	item, err := s.find(name)
	if err != nil {
		return nil, err
	}
	var secret ssSecret
	if err := s.conn.Object(ssDest, item).Call(ssItem+".GetSecret", 0, s.session).Store(&secret); err != nil {
		return nil, err
	}
	return secret.Value, nil
}

func (s *SecretService) Delete(name string) error {
	item, err := s.find(name)
	if errors.Is(err, ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	var prompt dbus.ObjectPath
	return s.conn.Object(ssDest, item).Call(ssItem+".Delete", 0).Store(&prompt)
}

func (s *SecretService) Kind() string { return "secret-service" }
