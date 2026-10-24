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

## Links that open background text under a task

Write `{{label|text}}` anywhere in a task's `title` or `detail`. It shows as a link named
`label`; Ivo clicks it to open `text` (markdown, up to 2000 characters) in a framed block
under the task, headed by the label, and clicks the header or the link again to close it.
A task can hold several such links, and one block is open at a time per task.

- Use it for background you would otherwise paste into chat: why the task exists, steps to
  reproduce, expected results. Keep the title and the visible words of `detail` short.
- Example `detail`: `Sign in with a valid account. {{Why this matters|The redirect changed, so check **both** paths.}}`
- The text is stored with the task, so it works in any session and in tasks written with
  `project`. Editing the title or detail so it no longer holds the link removes that text.
- `list` shows each link as `label ↗` but not the text: you wrote it, so you already know it.
- A blank `text` leaves the plain label. Ticked tasks hide their open blocks.

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
