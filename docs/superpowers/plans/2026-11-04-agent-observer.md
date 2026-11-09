# Local Agent Observer Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans.
**Goal:** Observe Codex, Claude Code and Kimi terminal sessions in the office.
**Architecture:** Studio loopback event receiver + bounded metadata store + read-only office page. Python standard-library helper appends existing CLI hooks.
**Tech Stack:** Node HTTP, Python 3.11+, React, existing Three.js/Phaser.
**Spec:** ../specs/2026-11-04-agent-observer-design.md
## Global Constraints
Preserve existing hooks. No prompts, tool arguments, outputs or secrets in events. No dispatch or approvals. Explicit states; freshness separate. Machine-specific deployment stays outside repo.
## Review Focus
Long silent tools remain uncertain (Task 1); duplicate/delayed events must not clear waits (Task 1); existing JSON/TOML hooks preserved (Task 2); offline receiver must fail open (Task 2); stale/restored/offline scenes cannot animate as live work (Task 3).
### Task 1: Receiver and state
Files: server/observer.js, server/index.js, tests/observer/receiver.test.mjs.
Interfaces: createObserver({stateDir, token, now}) -> handleHttp(req,res), snapshot(), ingest(event). Input: tool, sessionId, project, event, toolName, occurredAt, eventId. Snapshot: sessions[], generatedAt, staleAfterMs. Session: id, tool, sessionId, project, state, reason, updatedAt, stale, restored, events[].
- [x] Write Node tests for waiting retention/clear, identity isolation, duplicate/delayed events, stale restart, bounds, metadata filtering, HTTP authentication.
- [x] Run node --test tests/observer/receiver.test.mjs; expect missing-module failure.
- [x] Implement 200 sessions, 12 metadata events each, 120s freshness, token/private storage, loopback authenticated ingestion, read-only state.
- [x] Run tests (expect pass) and commit.
### Task 2: Hook helper
Files: scripts/observer-hooks.py, tests/observer/test_hooks.py, docs/integrations/local-observer.md.
Interfaces: send --tool TOOL reads raw hook stdin; install/uninstall --tool TOOL --home PATH --state-dir PATH; private connection.json contains URL/token.
- [x] Write normalization, metadata exclusion, additive JSON/TOML, idempotency/removal and fail-open tests.
- [x] Run python3 -m unittest discover -s tests/observer -p 'test_*.py'; expect missing helper.
- [x] Implement allowlist, bounded input, 0.6s request timeout, atomic backups, managed JSON entries and marked Kimi TOML block.
- [x] Run tests (expect pass) and commit.
### Task 3: Office and delivery
Files: src/app/observe/page.tsx, src/features/observer/*, existing scene props if needed, navigation, integration docs.
Interfaces: GET /api/observer/state every 2s; pure snapshot-to-OfficeAgent view model; no runtime provider or fake transcripts.
- [x] Add view model tests for waiting, stale/offline work, hidden history, separate identities; run targeted Vitest expecting missing-module failure.
- [x] Implement Chinese attention list, session detail, 3D/2D switch, readable status, empty/offline states and isolated layout.
- [x] Run tests, baseline comparison lint/typecheck, build/smoke and visible browser checks.
- [x] Install hooks with backups; collect genuine CLI events without modifying existing conversations; document actual vs simulated coverage.
- [x] Fresh whole-branch review, address substantive issues, commit and report limits.
