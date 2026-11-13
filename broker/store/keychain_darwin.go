package store

/*
#cgo CFLAGS: -Wno-deprecated-declarations
#cgo LDFLAGS: -framework Security -framework CoreFoundation
#include <Security/Security.h>
#include <CoreFoundation/CoreFoundation.h>
#include <stdlib.h>
#include <string.h>

static CFMutableDictionaryRef kc_query(const char *svc, const char *acct) {
	CFMutableDictionaryRef q = CFDictionaryCreateMutable(NULL, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
	CFStringRef s = CFStringCreateWithCString(NULL, svc, kCFStringEncodingUTF8);
	CFStringRef a = CFStringCreateWithCString(NULL, acct, kCFStringEncodingUTF8);
	CFDictionarySetValue(q, kSecClass, kSecClassGenericPassword);
	CFDictionarySetValue(q, kSecAttrService, s);
	CFDictionarySetValue(q, kSecAttrAccount, a);
	CFRelease(s);
	CFRelease(a);
	return q;
}

static OSStatus kc_delete(const char *svc, const char *acct) {
	CFMutableDictionaryRef q = kc_query(svc, acct);
	OSStatus st = SecItemDelete(q);
	CFRelease(q);
	return st;
}

static OSStatus kc_put(const char *svc, const char *acct, const void *data, int len) {
	kc_delete(svc, acct);
	CFMutableDictionaryRef q = kc_query(svc, acct);
	CFDataRef d = CFDataCreate(NULL, data, len);
	CFDictionarySetValue(q, kSecValueData, d);
	CFDictionarySetValue(q, kSecAttrAccessible, kSecAttrAccessibleWhenUnlockedThisDeviceOnly);
	CFStringRef label = CFSTR("GeckIt secret");
	CFDictionarySetValue(q, kSecAttrLabel, label);
	SecTrustedApplicationRef me = NULL;
	SecAccessRef access = NULL;
	OSStatus st = SecTrustedApplicationCreateFromPath(NULL, &me);
	if (st == errSecSuccess) {
		CFArrayRef apps = CFArrayCreate(NULL, (const void **)&me, 1, &kCFTypeArrayCallBacks);
		st = SecAccessCreate(label, apps, &access);
		CFRelease(apps);
	}
	if (st == errSecSuccess) {
		CFDictionarySetValue(q, kSecAttrAccess, access);
		st = SecItemAdd(q, NULL);
	}
	if (access) CFRelease(access);
	if (me) CFRelease(me);
	memset((void *)CFDataGetBytePtr(d), 0, CFDataGetLength(d));
	CFRelease(d);
	CFRelease(q);
	return st;
}

static OSStatus kc_get(const char *svc, const char *acct, void **out, int *outLen) {
	CFMutableDictionaryRef q = kc_query(svc, acct);
	CFDictionarySetValue(q, kSecReturnData, kCFBooleanTrue);
	CFDictionarySetValue(q, kSecMatchLimit, kSecMatchLimitOne);
	CFTypeRef result = NULL;
	OSStatus st = SecItemCopyMatching(q, &result);
	CFRelease(q);
	if (st != errSecSuccess) return st;
	CFDataRef d = (CFDataRef)result;
	*outLen = (int)CFDataGetLength(d);
	*out = malloc(*outLen > 0 ? *outLen : 1);
	memcpy(*out, CFDataGetBytePtr(d), *outLen);
	CFRelease(result);
	return st;
}

static void kc_free(void *p, int len) {
	memset(p, 0, len);
	free(p);
}
*/
import "C"

import (
	"fmt"
	"unsafe"
)

const keychainService = "org.anetrebskii.geckit.broker"

type Keychain struct{ service string }

func NewKeychain(service string) *Keychain {
	if service == "" {
		service = keychainService
	}
	return &Keychain{service: service}
}

func status(st C.OSStatus) error {
	switch st {
	case C.errSecSuccess:
		return nil
	case C.errSecItemNotFound:
		return ErrNotFound
	case C.errSecInteractionNotAllowed, C.errSecAuthFailed:
		return ErrLocked
	}
	return fmt.Errorf("keychain error %d", int(st))
}

func (k *Keychain) Put(name string, data []byte) error {
	svc, acct := C.CString(k.service), C.CString(name)
	defer C.free(unsafe.Pointer(svc))
	defer C.free(unsafe.Pointer(acct))
	var p unsafe.Pointer
	if len(data) > 0 {
		p = unsafe.Pointer(&data[0])
	}
	return status(C.kc_put(svc, acct, p, C.int(len(data))))
}

func (k *Keychain) Get(name string) ([]byte, error) {
	svc, acct := C.CString(k.service), C.CString(name)
	defer C.free(unsafe.Pointer(svc))
	defer C.free(unsafe.Pointer(acct))
	var out unsafe.Pointer
	var n C.int
	if err := status(C.kc_get(svc, acct, &out, &n)); err != nil {
		return nil, err
	}
	b := C.GoBytes(out, n)
	C.kc_free(out, n)
	return b, nil
}

func (k *Keychain) Delete(name string) error {
	svc, acct := C.CString(k.service), C.CString(name)
	defer C.free(unsafe.Pointer(svc))
	defer C.free(unsafe.Pointer(acct))
	err := status(C.kc_delete(svc, acct))
	if err == ErrNotFound {
		return nil
	}
	return err
}

func (k *Keychain) Kind() string { return "keychain" }

func Open(dir string) (Store, error) { return NewKeychain(""), nil }
