package store

import (
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

type dpapi struct{}

func blob(b []byte) *windows.DataBlob {
	if len(b) == 0 {
		return &windows.DataBlob{}
	}
	return &windows.DataBlob{Size: uint32(len(b)), Data: &b[0]}
}

func take(out *windows.DataBlob) []byte {
	b := make([]byte, out.Size)
	copy(b, unsafe.Slice(out.Data, out.Size))
	windows.LocalFree(windows.Handle(unsafe.Pointer(out.Data)))
	return b
}

func (dpapi) seal(plain []byte) ([]byte, error) {
	var out windows.DataBlob
	if err := windows.CryptProtectData(blob(plain), nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &out); err != nil {
		return nil, err
	}
	return take(&out), nil
}

func (dpapi) open(sealed []byte) ([]byte, error) {
	var out windows.DataBlob
	if err := windows.CryptUnprotectData(blob(sealed), nil, nil, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &out); err != nil {
		return nil, err
	}
	return take(&out), nil
}

func Open(dir string) (Store, error) {
	return &sealedFiles{dir: filepath.Join(dir, "items"), s: dpapi{}, kind: "dpapi"}, nil
}
