# Security Policy

## Reporting A Vulnerability

Please do not open public GitHub issues for security vulnerabilities.

Preferred path:

- If the repository host exposes private vulnerability reporting or GitHub Security Advisories for this repo, use that path first.

Fallback path:

- If no private reporting channel is available, open a minimal public issue requesting a private contact channel and do not include exploit details, tokens, or proof-of-concept payloads in that issue.

When reporting a vulnerability, include:

- A clear description of the issue.
- Impact and affected areas.
- Reproduction steps or a proof of concept.
- Any suggested mitigation if you have one.

We aim to acknowledge reports promptly, investigate them, and coordinate a fix and disclosure timeline with the reporter.

## Current Security Limitations

- Studio gateway settings are stored on disk in plaintext under the local Hermes state directory (`~/.hermes/hermes3d/settings.json`).
- The current UI loads the configured upstream gateway URL/token into browser memory at runtime, even though those values are not stored in browser persistent storage.
- There is currently no built-in cookie issuance/login flow for `STUDIO_ACCESS_TOKEN`; deployments that enable the access gate must provision the `studio_access` cookie outside the app.

## Scope

Please report issues related to:

- Authentication or access-control bypasses.
- Secret handling or token exposure.
- Remote code execution or privilege escalation paths.
- Unsafe filesystem, proxy, or network behavior.
- Dependency vulnerabilities that materially affect this project.

## Deployment Notes

- In production, set `UPSTREAM_ALLOWLIST` for the Studio gateway proxy.
- In production, set `CUSTOM_RUNTIME_ALLOWLIST` if you use `/api/runtime/custom`. If unset, it falls back to `UPSTREAM_ALLOWLIST`.
- Empty allowlists are intended for local development only.
- If you enable `STUDIO_ACCESS_TOKEN`, you must also provision the `studio_access` cookie through your deployment/auth layer.

## AgentCrew 3D local observer

The read-only guarantee applies to `/observe`, not all inherited Studio routes.
`--observe-public` restricts remote access to observer reads and display resources;
Hook ingestion remains loopback-only and token-authenticated. Do not expose this
unauthenticated viewing mode to the public Internet: project paths and session
metadata are visible to clients that can reach it.

Keep the observer state directory (by default `~/.hermes3d-observer`), Hook backup
files and local `.env` files private. The Codex lifecycle fallback reads bounded
local session tails to extract allowlisted lifecycle metadata; it does not store
or transmit conversation bodies. See [observer setup](docs/integrations/local-observer.md).
