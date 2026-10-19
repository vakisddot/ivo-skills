---
name: codex
description: Send a note to, or read from, a Codex session through the Codex CLI. Use only when Ivo explicitly asks to start a Codex session, ask a saved Codex session a question, or get Codex's opinion. For use from Claude Code; from Codex, use ivo:claude instead.
---

# codex

Exchange a focused note with Codex in a new or saved session. Resume starts a
separate process on the saved history; it does not type into an open Codex window.
Every message leaves this machine for another service, so only send what Ivo asked
to share.

## Auth first

Before anything else run `codex login status`. If it exits nonzero, stop and say:
"Codex CLI needs you to log in. Run `codex login`, then tell me to retry."

An auth problem at any later step (not logged in, expired or unrefreshable token,
401/403, refresh failure) gets the same treatment: stop all further Codex CLI calls
for this task at once, quote the error to Ivo, name the fix. Do not retry, work around it, or ask for credentials in chat.
Keep auth failures separate from network errors, unavailable models, and denied
actions when reporting.

## Choose the target

- **New session:** no ID needed. The first JSONL event is
  `{"type":"thread.started","thread_id":"..."}`; give Ivo that ID.
- **Saved session:** confirm the exact title and UUID with Ivo. Never use `--last`
  for an exchange meant for a specific task. Titles and IDs are in
  `$CODEX_HOME/session_index.jsonl` (default `~/.codex`); fields `id`, `thread_name`,
  `updated_at`. This is local storage, not a stable API.
- A thread owned by another Codex process (a task open in Codex Desktop, even
  when idle) fails with `thread-store conflict ... already has an active writer`.
  Report it. Do not kill the owner or touch session files.

## Prepare the note

Write `notes.txt` (UTF-8) in a fresh, git-ignored directory per exchange so an old
reply cannot pass for a new one. Include: what Codex may do ("Discussion only: do
not edit code, change Git state, call tools, or message another agent"), the topic,
revision and working-tree state, what you verified, what is only reported by others,
small evidence excerpts (Codex cannot follow your links), what was not checked, and
one clear question. Never paste whole histories.

## Send

Run from the repository root (outside a repo add `--skip-git-repo-check` on purpose).
Pipe the note on stdin (`-`). Put options before `resume`; the CLI rejects
`--sandbox` after it.

```
# new session
codex exec --sandbox read-only --ignore-user-config --ignore-rules [-m MODEL] --json -o DIR/reply.txt - < DIR/notes.txt > DIR/events.jsonl 2> DIR/stderr.log

# saved session
codex exec --sandbox read-only --ignore-user-config --ignore-rules [-m MODEL] resume SESSION_ID --json -o DIR/reply.txt - < DIR/notes.txt > DIR/events.jsonl 2> DIR/stderr.log
```

- In PowerShell use `Get-Content -Raw -Encoding utf8 DIR/notes.txt | codex exec ...`
  and PowerShell 7 or a POSIX shell for the redirections.
- `--ignore-user-config` drops the model from `config.toml`, so pass `-m` when the
  model matters. `gpt-6-luna` is cheap and fine for smoke tests and light questions.
- The read-only sandbox limits writes, not reads or connectors, and Codex has no
  switch that disables every tool. The no-tools line in the note is the real guard.

## Read the reply

Require exit code 0 and a non-empty `reply.txt`, and scan `events.jsonl` for error
events. A started process is not a delivered message. To read what a saved session
holds, resume it with a question rather than parsing its rollout files.

Report to Ivo: the session title and ID, exit code, reply path, and the reply
summarized as agreements, corrections, and open questions. Separate what Codex
checked from what it only inferred from the note. Stop after the requested exchange.

## Show Ivo the session

After a new session starts, give Ivo the session ID and `codex resume SESSION_ID`.
By ID it works for `exec` sessions; the bare `codex resume` picker hides them unless
you add `--include-non-interactive` (and `--all` outside the original folder). If
the host can open a tab in Ivo's terminal panel, run that command there and link the
tab so he can click through.

An open interactive tab owns the thread, so `codex exec resume` fails with the
active-writer conflict until Ivo exits it. Open the tab after the last round of the
exchange, or tell Ivo to close it before you send another note.

Sessions made by `codex exec` get no title in `session_index.jsonl`, and whether
Codex Desktop lists them has not been confirmed.
