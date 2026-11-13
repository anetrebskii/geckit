package main

import (
	"net"
	"os"
	"path/filepath"
	"unsafe"

	"github.com/Microsoft/go-winio"
	"golang.org/x/sys/windows"
)

func defaultDir() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base, _ = os.UserConfigDir()
	}
	return filepath.Join(base, "GeckIt Broker")
}

func defaultSocket(string) string {
	name := os.Getenv("USERNAME")
	if name == "" {
		name = "user"
	}
	return `\\.\pipe\geckit-broker-` + name
}

func listen(name string) (net.Listener, error) {
	tok := windows.GetCurrentProcessToken()
	user, err := tok.GetTokenUser()
	if err != nil {
		return nil, err
	}
	sddl := "D:P(A;;GA;;;" + user.User.Sid.String() + ")"
	return winio.ListenPipe(name, &winio.PipeConfig{SecurityDescriptor: sddl})
}

func harden() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	p, err := windows.UTF16PtrFromString(exe)
	if err != nil {
		return
	}
	proc := windows.NewLazySystemDLL("wer.dll").NewProc("WerAddExcludedApplication")
	if proc.Find() == nil {
		_, _, _ = proc.Call(uintptr(unsafe.Pointer(p)), 0)
	}
}
