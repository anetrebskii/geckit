//go:build darwin && cgo

package main

import "C"

import (
	"os"
	"syscall"
)

//export GeckItVPNRun
func GeckItVPNRun(inputFD, outputFD, statusFD, stopFD C.int) C.int {
	descriptors := []int{int(inputFD), int(outputFD), int(statusFD), int(stopFD)}
	for _, descriptor := range descriptors {
		if descriptor < 0 || syscall.SetNonblock(descriptor, true) != nil {
			for _, fd := range descriptors {
				if fd >= 0 {
					syscall.Close(fd)
				}
			}
			return 1
		}
	}
	input := os.NewFile(uintptr(inputFD), "packet-input")
	output := os.NewFile(uintptr(outputFD), "packet-output")
	status := os.NewFile(uintptr(statusFD), "transport-status")
	control := os.NewFile(uintptr(stopFD), "transport-stop")
	if input == nil || output == nil || status == nil || control == nil {
		for _, file := range []*os.File{input, output, status, control} {
			if file != nil {
				file.Close()
			}
		}
		return 1
	}
	defer status.Close()
	defer control.Close()
	stop := make(chan os.Signal, 1)
	go func() {
		var byte [1]byte
		control.Read(byte[:])
		stop <- os.Interrupt
	}()
	return C.int(run(input, output, status, stop))
}
