# Local agent observation

Status: approved by the user on 2026-11-04; implementation authorized.

## Intent
Show Codex, Claude Code, and Kimi Code terminal sessions in the existing Hermes3D office. The user watches the screen and returns to the appropriate terminal for confirmation or other input. Preserve existing Orca and work-journal hooks.

## Approaches
- External Agent Bus: documented integration, but another service and additional waiting-state work.
- In-project lightweight observer (user selected): a local event receiver, session metadata store, and office observation mode.
- Bidirectional runtime integration: outside this request.

## Intake
A helper normalizes supported CLI hooks and posts to a loopback receiver in Studio. Identity is tool plus native session ID, with a separate subagent identifier when actually available. Multiple sessions from the same tool must remain distinct.
Allow only tool name, native session identity, project path/name, event category, invoked tool name, timestamps, and optional terminal locator metadata. Never forward prompts, tool arguments, output, transcripts, or credentials.
Use a local receiver token, schema/size checks, loopback-only ingestion, and a short hook timeout. Browser reads must not reveal the token. Failure must not interrupt terminal work. No approve/deny responses or terminal control.
Install hooks additively and idempotently, back up touched config, and uninstall only managed entries. Verify supported event names for each installed CLI. Existing sessions may require restart/reload; do not restart them automatically.

## State
- Ready: session start.
- Working: user prompt or explicit execution activity.
- Waiting for you: permission request or verified structured question event.
- Turn ended: explicit Stop, not proof of task completion or acceptance.
- Interrupted: explicit interruption.
- Error reported: explicit failure; later progress can recover.
- Session ended: explicit session end.

Keep waiting until evidence of progress, user input, interruption, or termination. PreToolUse alone must not clear an existing permission wait. Arbitrary assistant prose questions cannot be reliably detected; show those as a turn ending, not a fabricated approval request.
Freshness is separate from state: last-event age and stale/unknown marker after a documented threshold. Silence cannot prove completion, approval waiting, or process exit.
Persist bounded metadata snapshots. On restart, restored records are stale until refreshed. Disconnected/stale records must not animate as confidently active. Allow hiding historical ended sessions from the view.

## Display
Retain the office as the main visual surface, supporting existing 3D/2D rendering where compatible. Add a clearly named observation mode.
Display tool, project, shortened session ID, state, last-update age, and waiting category/tool name. Highlight waiting sessions in an attention list and in the scene without relying on color alone.
No chat dispatch, execution, or approval controls for observed sessions. Presentation controls remain usable.
An empty view explains that fresh terminal events are needed; never insert demo agents into live observation.

## Verification and delivery
- Unit checks: all three normalizers, distinct sessions, waiting retention/clearing, stale/restarted records, bounded storage, bad requests, authorization, idempotent install/removal.
- Actual local HTTP integration checks and browser refresh/reconnect checks.
- Visible browser inspection of working/waiting/ended states. Fixture replay remains labeled simulation.
- Real CLI event capture for each tool where feasible without modifying existing conversations. List actual CLI/event coverage separately from replay; human terminal approval validation stays pending until actually performed.
- Startup, shutdown, hook reload, uninstall, rollback, and limitations documented. Machine-specific deployment notes stay outside the open-source repository.
- No writes to agents' project files, no task dispatch, no automatic approval, no cancellation or chat injection.

## Builder decisions
Choose office bridge, bounded history size, freshness threshold, and port after checking the existing scene/state model. Reuse scene inputs instead of fabricating chat transcripts or executable approvals.
