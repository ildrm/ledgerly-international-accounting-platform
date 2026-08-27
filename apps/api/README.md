# Ledgerly API security notes

`TRUST_PROXY` defaults to `false`. Configure it only when every request reaches the API through known, header-sanitizing proxies. The accepted value is a comma-separated allowlist of literal IP addresses or CIDR ranges; broad values such as `true`, `*`, hostnames, and named proxy groups are rejected.

Authentication throttles currently use Nest's process-local in-memory store. This is correct for the single API process in the foundation environment, but it is not a distributed control: counters reset on restart and multiply with replicas. Before horizontal scaling, add an approved shared throttler store (normally Redis), retain per-IP limits, add an account-keyed login limit, and test behavior across at least two API replicas. No Redis throttler package is currently present, so this limitation is deliberately documented rather than hidden behind a non-functional configuration flag.
