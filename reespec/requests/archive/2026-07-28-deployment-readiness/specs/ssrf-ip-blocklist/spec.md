# Spec — ssrf-ip-blocklist (WS-C1)

The SSRF guard blocks IPv6 private/loopback ranges, the unspecified address, and IPv4-mapped private
addresses — not just IPv4 dotted ranges.

## S1 — blocks 0.0.0.0
- **GIVEN** a URL `http://0.0.0.0:8080/`
- **WHEN** the guard checks it
- **THEN** it is unsafe (`safe === false`).

## S2 — blocks IPv6 ULA (fc00::/7)
- **GIVEN** `http://[fd00::1]/`
- **WHEN** checked
- **THEN** unsafe.

## S3 — blocks IPv6 link-local (fe80::/10)
- **GIVEN** `http://[fe80::1]/`
- **WHEN** checked
- **THEN** unsafe.

## S4 — blocks IPv4-mapped private (::ffff:10.0.0.1)
- **GIVEN** `http://[::ffff:10.0.0.1]/`
- **WHEN** checked
- **THEN** unsafe.

## S5 — public addresses still allowed (regression)
- **GIVEN** a resolvable public host/IP
- **WHEN** checked
- **THEN** safe (no over-blocking).
