---
name: context-check
description: Audit all automatically loaded context in this session. Use when user says "context check", "what instructions do you have", "show my context", "what's loaded", or "instruction audit".
---

# Context Check

Report every piece of automatically injected context you currently have. This is a diagnostic tool — the user needs to verify what actually got loaded into this session.

**CRITICAL: Do NOT read any files from disk. Do NOT use Read, Glob, Grep, or any file tools. Only report what is already in your system prompt and conversation context right now.** If something wasn't loaded, its absence from this report is the signal.

## Report these sections (skip if no data present):

### 1. Instruction Files (CLAUDE.md / AGENTS.md)
For each CLAUDE.md, AGENTS.md, or equivalent instruction file whose contents appear in your context:
- Exact file path
- Key rules (3-5 bullets summarizing the actual content you can see)

### 2. Memory
If a MEMORY.md index is in your context:
- Its path
- Every entry listed in it (one line each)

### 3. Skills
List every skill name and description visible in your context. Note which are user-level vs project-level if distinguishable.

### 4. MCP Servers & Tools
For each MCP server referenced in your context:
- Server name/identifier
- Tool count
- Any server-specific instructions

### 5. Environment
Platform, shell, working directory, git branch, model, context window — whatever is present.

### 6. Git Status
Branch, modified files, recent commits — from the injected snapshot only.

### 7. Settings & Hooks
Any settings, hooks, or permission config visible in your context.

### 8. Active Modes
Plan mode, cron jobs, or other active state.

### 9. System Prompt
The full text of your system prompt, if visible.

## Rules
- **ONLY report what is already in your context. Do not fetch, read, or look up anything.**
- Be exhaustive — if it's in your system prompt, it should be in this report.
- Use concise bullets.
- Do not editorialize or suggest improvements.
