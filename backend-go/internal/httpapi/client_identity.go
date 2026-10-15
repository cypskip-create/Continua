package httpapi

import (
	"crypto/sha256"
	"crypto/subtle"
	"net"
	"net/http"
	"net/netip"
)

// A public forwarded header alone is never a trusted rate-limit identity.
// Only the owned edge with the separate server-only origin secret may attach it.
func (s *Server) clientIdentity(r *http.Request) string {
	if len(s.EdgeOriginSecret) >= 32 && len(s.EdgeOriginSecret) <= 512 {
		provided := r.Header.Get("X-Continua-Edge-Secret")
		if len(provided) >= 32 && len(provided) <= 512 {
			actual, expected := sha256.Sum256([]byte(provided)), sha256.Sum256([]byte(s.EdgeOriginSecret))
			if subtle.ConstantTimeCompare(actual[:], expected[:]) == 1 {
				ip := r.Header.Get("X-Continua-Client-IP")
				if len(ip) <= 64 {
					if parsed, err := netip.ParseAddr(ip); err == nil {
						return parsed.Unmap().String()
					}
				}
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
