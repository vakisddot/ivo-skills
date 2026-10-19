---
name: claude
description: Send a note to, or read from, a Claude Code session through the Claude CLI. Use only when Ivo explicitly asks to start a Claude Code session, ask a saved Claude Code session a question, or get Claude's opinion. For use from Codex; from Claude Code, use ivo:codex instead. Untested end to end.
---

# claude

**Untested.** The commands come from Ivo's notes and the CLI parsed every flag, but
the only run failed at token refresh before any reply came back. Tell Ivo this when
you use the skill, and report what actually happens.

Exchange a focused note with Claude Code in a new or saved session. Resume starts a
separate process on the saved history; it does not type into an open Claude window.
Every message leaves this machine for another service, so only send what Ivo asked
to share.

## Auth first

Before anything else run `claude auth status --text`. If it exits nonzero, stop and
say: "Claude CLI needs you to log in. Run `claude auth login`, then tell me to retry."

A passing status check is not proof. `claude --print` can still fail with
`Failed to refresh OAuth token: another Claude Code process is refreshing it or
exited mid-refresh`, seen while Claude Desktop and many other Claude processes were
running. Treat that and any other auth failure (not logged in, expired token,
401/403) as stop-now: halt all further Claude CLI calls for this task, quote the
error to Ivo, name the fix, and do not retry, work around it, or ask for credentials
in chat. Keep auth failures separate from network
errors, unavailable models, and denied actions when reporting.

## Choose the target

- **New session:** no ID needed. The JSON reply carries a `session_id`; give Ivo that ID.
- **Saved session:** confirm the exact title and UUID with Ivo, and wait until that
  session is idle. Transcripts are `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl`;
  listing them by modified time can help Ivo pick. `sessions-index.json` may be
  absent or stale. Do not copy whole histories into notes.
- To get a separate conversation instead of appending to the saved one, add
  `--fork-session`. A fork still carries the inherited history and its cost.

## Prepare the note

Write `notes.txt` (UTF-8) in a fresh, git-ignored directory per exchange so an old
reply cannot pass for a new one. Include: what Claude may do ("Discussion only: do
not edit code, change Git state, call tools, or message another agent"), the topic,
revision and working-tree state, what you verified, what is only reported by others,
small evidence excerpts (Claude cannot open your files with tools off), what was not
checked, and one clear question.

## Send

Pipe the note on stdin. Keep every restriction together for discussion-only notes.

```
# new session
claude --print --safe-mode --tools "" --strict-mcp-config [--model MODEL] --output-format json < DIR/notes.txt > DIR/reply.json 2> DIR/stderr.log

# saved session
claude --resume SESSION_ID --print --safe-mode --tools "" --strict-mcp-config [--model MODEL] --output-format json < DIR/notes.txt > DIR/reply.json 2> DIR/stderr.log
```

- The empty argument after `--tools` must reach the CLI. In PowerShell use
  PowerShell 7, or call the executable with an argument list (for example Python
  `subprocess.run`). Pipe with `Get-Content -Raw -Encoding utf8 DIR/notes.txt | claude ...`.
- `--tools ""` removes built-in tools only. `--safe-mode` disables hooks, skills,
  plugins, and MCP; `--strict-mcp-config` excludes ordinary MCP configuration.
- `--model haiku` is the cheap choice for smoke tests and light questions.

## Read the reply

Parse `reply.json`. Require exit code 0, `is_error` false, and a non-empty `result`.
A started process is not a delivered message. To read what a saved session holds,
resume it with a question rather than parsing its transcript.

Report to Ivo: the session title and ID, exit code, reply path, and the reply
summarized as agreements, corrections, and open questions. Separate what Claude
checked from what it only inferred from the note. Stop after the requested exchange.
