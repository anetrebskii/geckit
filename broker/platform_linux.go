package main

import "golang.org/x/sys/unix"

func hardenOS() { _ = unix.Prctl(unix.PR_SET_DUMPABLE, 0, 0, 0, 0) }
