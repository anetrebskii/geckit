package main

import (
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net"
	"net/netip"
	"strconv"
	"strings"
)

const configLimit = 64 * 1024

var invalidConfig = errors.New("Invalid or unsupported AmneziaWG configuration.")

type tunnelConfig struct {
	uapi string
	mtu  int
}

var interfaceKeys = map[string]string{
	"PrivateKey": "private_key", "ListenPort": "listen_port",
	"Jc": "jc", "Jmin": "jmin", "Jmax": "jmax",
	"S1": "s1", "S2": "s2", "S3": "s3", "S4": "s4",
	"H1": "h1", "H2": "h2", "H3": "h3", "H4": "h4",
	"I1": "i1", "I2": "i2", "I3": "i3", "I4": "i4", "I5": "i5",
	"HeaderProtectionKey":    "header_protection_key",
	"ContentPaddingAddition": "content_padding_addition",
	"RekeyAfterTime":         "rekey_after_time", "RekeyTimeout": "rekey_timeout",
	"RejectAfterTime": "reject_after_time", "KeepaliveTimeout": "keepalive_timeout",
	"MaxHandshakeAttempts": "max_handshake_attempts",
	"RandomTrailers":       "random_trailers", "DisableCookies": "disable_cookies",
}

var peerKeys = map[string]string{
	"PublicKey": "public_key", "PresharedKey": "preshared_key",
	"Endpoint": "endpoint", "AllowedIPs": "allowed_ip",
	"PersistentKeepalive": "persistent_keepalive_interval",
}

func parseConfig(text string) (tunnelConfig, error) {
	result := tunnelConfig{mtu: 1280}
	if len(text) > configLimit || strings.ContainsRune(text, '\x00') {
		return result, invalidConfig
	}
	section := ""
	seen := make(map[string]bool)
	var local, peer []string
	awg := false
	for _, original := range strings.Split(strings.TrimPrefix(text, "\uFEFF"), "\n") {
		line := strings.TrimSpace(strings.SplitN(strings.SplitN(original, "#", 2)[0], ";", 2)[0])
		if line == "" {
			continue
		}
		if line == "[Interface]" && section == "" {
			section = "Interface"
			continue
		}
		if line == "[Peer]" && section == "Interface" {
			section = "Peer"
			continue
		}
		name, value, ok := strings.Cut(line, "=")
		name, value = strings.TrimSpace(name), strings.TrimSpace(value)
		if !ok || seen[name] || section == "" {
			return result, invalidConfig
		}
		seen[name] = true
		if section == "Interface" && (name == "Address" || name == "DNS") {
			if value == "" {
				return result, invalidConfig
			}
			for _, part := range strings.Split(value, ",") {
				var err error
				if name == "Address" {
					_, err = netip.ParsePrefix(strings.TrimSpace(part))
				} else {
					_, err = netip.ParseAddr(strings.TrimSpace(part))
				}
				if err != nil {
					return result, invalidConfig
				}
			}
			continue
		}
		if section == "Interface" && name == "MTU" {
			mtu, err := strconv.Atoi(value)
			if err != nil || mtu < 576 || mtu > 65535 {
				return result, invalidConfig
			}
			result.mtu = mtu
			continue
		}
		keys := interfaceKeys
		if section == "Peer" {
			keys = peerKeys
		}
		uapiKey, ok := keys[name]
		if !ok {
			return result, invalidConfig
		}
		if strings.HasSuffix(name, "Key") {
			key, err := base64.StdEncoding.Strict().DecodeString(value)
			if err != nil || len(key) != 32 || base64.StdEncoding.EncodeToString(key) != value {
				return result, invalidConfig
			}
			if (name == "PrivateKey" || name == "PublicKey") && strings.Trim(hex.EncodeToString(key), "0") == "" {
				return result, invalidConfig
			}
			value = hex.EncodeToString(key)
		}
		if name == "Endpoint" {
			host, port, err := net.SplitHostPort(value)
			n, portErr := strconv.Atoi(port)
			if err != nil || host == "" || portErr != nil || n < 1 || n > 65535 {
				return result, invalidConfig
			}
		}
		if name == "RandomTrailers" || name == "DisableCookies" {
			switch strings.ToLower(value) {
			case "true", "on", "1":
				value = "true"
			case "false", "off", "0":
				value = "false"
			default:
				return result, invalidConfig
			}
		}
		if section == "Interface" {
			local = append(local, uapiKey+"="+value)
			awg = awg || (name != "PrivateKey" && name != "ListenPort")
		} else if name == "AllowedIPs" {
			for _, part := range strings.Split(value, ",") {
				prefix, err := netip.ParsePrefix(strings.TrimSpace(part))
				if err != nil {
					return result, invalidConfig
				}
				peer = append(peer, "allowed_ip="+prefix.String())
			}
		} else if name == "PublicKey" {
			peer = append([]string{uapiKey + "=" + value}, peer...)
		} else {
			peer = append(peer, uapiKey+"="+value)
		}
	}
	if section != "Peer" || !awg {
		return result, invalidConfig
	}
	for _, name := range []string{"PrivateKey", "Address", "PublicKey", "Endpoint", "AllowedIPs"} {
		if !seen[name] {
			return result, invalidConfig
		}
	}
	result.uapi = strings.Join(append(append(local, "replace_peers=true"), peer...), "\n") + "\n"
	return result, nil
}
