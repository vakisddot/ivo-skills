# ivo-skills

Personal skills for **Claude Code** and **Codex**, in one repo.

Both hosts read the same `SKILL.md` files. Only the manifests differ, so each skill
is written once and stays in sync everywhere.

Both hosts namespace a plugin's skills by the plugin name, so these are referenced
as `ivo:<skill>` — the `ivo-` prefix lives in the namespace, not in the skill names.

## Skills

| Skill | What it does |
|---|---|
| `ivo:code` | Implementation and review using the smallest complete solution that stays clear, correct, and maintainable |
| `ivo:teach` | Socratic mode — guides toward the answer instead of handing it over |
| `ivo:simple` | Rewrites one answer in extremely plain English, no jargon |
| `ivo:context-check` | Reports every instruction and file auto-loaded into the session |
| `ivo:roast-codebase` | Code review that is funny and actually useful |
| `ivo:remove-bg-image` | Flood-fill background removal to a transparent PNG |

## Install

### Claude Code

```
/plugin marketplace add <owner>/ivo-skills
/plugin install ivo@ivo-skills
```

### Codex

```
codex plugin marketplace add <owner>/ivo-skills
codex plugin add ivo@ivo-skills
```

Start a new thread/session afterwards so the host picks up the skills.

For local development, point either host at the working copy instead:

```
codex plugin marketplace add /path/to/ivo-skills
claude plugin marketplace add /path/to/ivo-skills
```

## Layout

```
.claude-plugin/marketplace.json     Claude Code entry point   (marketplace: ivo-skills)
.agents/plugins/marketplace.json    Codex entry point         (marketplace: ivo-skills)
plugins/ivo/
  .claude-plugin/plugin.json        Claude manifest
  .codex-plugin/plugin.json         Codex manifest (semver + interface metadata)
  skills/<name>/
    SKILL.md                        read by both hosts
    agents/openai.yaml              Codex display metadata; ignored by Claude
```

Both marketplaces resolve plugin sources as `./plugins/<name>` relative to the repo
root, so a single `plugins/` tree serves both.

## Updating a skill

Both hosts snapshot the plugin into a version-keyed cache at install time, so editing
a `SKILL.md` in this repo does **not** reach a running host on its own. Re-sync after
editing:

```
codex plugin add ivo@ivo-skills

claude plugin uninstall ivo@ivo-skills
claude plugin install ivo@ivo-skills
```

Codex re-copies on a plain re-add even at the same version. Claude's
`plugin update` is version-gated and reports "already at the latest version" for
same-version edits, so uninstall/reinstall (or bump `version`) is required there.
Start a new session afterwards.

After editing manifests, revalidate both sides:

```
claude plugin validate plugins/ivo
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/ivo
```

## Host neutrality

One copy of each skill serves both hosts, so skill text must not name a specific
assistant. Refer to instruction files as "CLAUDE.md, AGENTS.md, or equivalent", and
write "your last response" rather than naming the assistant.
