---
name: user-tasks
description: Put things Ivo must check or do (test checklists, manual verification, decisions) into his always-visible "Your tasks" pane instead of the chat, and read back what he ticked. Use whenever you would hand Ivo a checklist.
---

# User tasks

The `user-tasks` mod keeps a persistent checklist pane beside the chat, one list per
project. Anything you ask Ivo to check or do goes there, not only in the chat, so it
cannot scroll away. Everything goes through one tool, `mcp__user-tasks__user_tasks`
(load it with ToolSearch if it is not listed), selected by `action`:

| action | input | does |
|---|---|---|
| `add` | `tasks: [{ title, detail?, group? }]` | Appends items, returns their ids. `group` names a section, e.g. `"Verify login fix"`. |
| `update` | `id`, any of `title`, `detail`, `group`, `done` | Edits one item. `done: false` re-opens it. |
| `remove` | `id` | Deletes one item. |
| `clear` | `scope?: "done"` (default) or `"all"`, `group?` | Removes ticked items (or all), optionally only within one group. |
| `list` | `group?` | Returns every item with its id, group and state. |

Add `project` (a folder path) to any call to write to another project's list. By
default it is this session's folder; a worktree resolves to its main repository, so a
branch worktree shares the repo's list.

## When Ivo refers to a task

Every item shows its id as `#N` in the pane; clicking it puts `Regarding user task #N, ` in his prompt
box (or on his clipboard when the box is unavailable). When a message mentions "user task #N",
`list` and read item N, with its group and detail, before answering. The id, not the
position, identifies it: ids never change while an item exists.

## Attaching the reasoning to a task

A `title` or `detail` may contain `[label](prev)`. The mod keeps a copy of the text you wrote
just before this call (up to 2000 characters), and Ivo clicks `label` to read it under the
task in the pane, then clicks again to close it. The chat itself cannot be scrolled to from
a mod, so the copy is the reference.

- Write the explanation as a normal paragraph before the call, then link it from the task
  it explains. Several tasks in one call share that same paragraph.
- Use it rarely, only where the passage explains why the task exists or what to look for.
- If no reply text was available, the call's result says so and the label stays plain text.
- `list` shows these links as `label ↗`.

## How to use it

- Write one short imperative `title` ("Open Settings and toggle dark mode") and put
  the expected result in `detail`, one line.
- Put a whole checklist in one `add` call with a shared `group`.
- Before asking Ivo "did you test X?", `list` first: he may have ticked it already.
- Tick state is Ivo's. Do not set `done: true` for him except to mirror something he told
  you in chat.
- When a group is finished and you have read the results, `clear` it so the pane stays
  small.
- Tell Ivo in one line that the checklist is in the pane; do not repeat it in chat.
