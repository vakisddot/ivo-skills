import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import type { Note, Task } from '../types'

type Stored = { nextId: number; tasks: Task[] }
type NoteInput = { label?: string; text?: string }
type Input = {
  action?: 'add' | 'update' | 'remove' | 'clear' | 'list'
  project?: string
  tasks?: { title: string; detail?: string; group?: string; notes?: NoteInput[] }[]
  id?: number
  title?: string
  detail?: string
  group?: string
  notes?: NoteInput[]
  done?: boolean
  scope?: 'done' | 'all'
}

const PANE = 'user-tasks'
const TOOL = 'mcp__user-tasks__user_tasks'
const POLL_MS = 2000
const MAX_NOTE = 2000
const MAX_LABEL = 40

const tasks = atom({ plugin: 'user-tasks', key: 'tasks' } as const, [])
const isHidingDone = atom({ plugin: 'user-tasks', key: 'isHidingDone' } as const, false)
/** The notes open now, by note id: at most one per task (note ids are `<task id>-<n>`). */
const openNotes = atom({ plugin: 'user-tasks', key: 'openNotes' } as const, [])

/** Links an earlier version put in titles and details, before a task's reference text became its notes. */
const LEGACY_LINK = /\[([^\]]+)\]\(https:\/\/user-tasks\.invalid\/[^)\s]+\)/g

// Module state. A reload re-runs session.start, which sets it again.
let current = ''
let queue: Promise<unknown> = Promise.resolve()

const NOTES_SCHEMA = {
  type: 'array',
  description:
    'Collapsible background Ivo opens under the task by clicking its label. For context that would otherwise '
    + 'be pasted in chat: why the task exists, steps, expected results. Up to 2000 characters of markdown each.',
  items: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'Short link text, e.g. "Why this matters".' },
      text: { type: 'string', description: 'The note, markdown.' },
    },
    required: ['text'],
  },
}

const SCHEMA = {
  type: 'object',
  properties: {
    action: { enum: ['add', 'update', 'remove', 'clear', 'list'] },
    tasks: {
      type: 'array',
      description: 'add: the items to append.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short imperative title.' },
          detail: { type: 'string', description: 'One line: what to look for.' },
          group: { type: 'string', description: 'Section heading, e.g. "Verify login fix".' },
          notes: NOTES_SCHEMA,
        },
        required: ['title'],
      },
    },
    id: { type: 'number', description: 'update, remove: the item id.' },
    title: { type: 'string', description: 'update: new title.' },
    detail: { type: 'string', description: 'update: new detail; "" removes it.' },
    group: { type: 'string', description: 'update: new group, "" ungroups; clear, list: only this group.' },
    notes: { ...NOTES_SCHEMA, description: `update: replaces the item's notes; [] removes them. ${NOTES_SCHEMA.description}` },
    done: { type: 'boolean', description: 'update: tick or untick. Ivo ticks items himself.' },
    scope: { enum: ['done', 'all'], description: 'clear: ticked items only (default) or everything.' },
    project: { type: 'string', description: 'Folder of another project, to use its list. Default: this session.' },
  },
  required: ['action'],
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ivo-tasks', description: 'Open the "Your tasks" pane', immediate: true })
    await $.tool.register({
      name: 'user_tasks',
      description:
        'Ivo\'s persistent "Your tasks" checklist, one per project, always visible beside the chat. '
        + 'Put every checklist you hand Ivo (things to test, check or do) here instead of only in chat. '
        + 'Actions: add {tasks:[{title,detail?,group?,notes?}]}, update {id,title?,detail?,group?,notes?,done?}, '
        + 'remove {id}, clear {scope?:"done"|"all",group?}, list {group?} (returns what Ivo has ticked). '
        + 'notes: [{label,text}] are collapsible background under a task: put context there instead of in chat. '
        + 'Optional project: folder path of another project. '
        + 'When Ivo mentions "user task #N" (e.g. "Regarding user task #N, ...") he means the item with id N in his list: list it to read what he refers to.',
      inputSchema: SCHEMA,
      isDeferred: false,
    })

    current = await projectOf($, await $.session.root())
    await refresh($)
    $.clock.every(POLL_MS, () => void refresh($))
    void $.ui.open({ id: PANE, title: 'Your tasks' })

    return next(e)
  })

  on('command.run', { command: 'ivo-tasks' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Your tasks' })

    return { text: 'Opened the "Your tasks" pane.' }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    try {
      return { result: await run($, e as Input) }
    } catch (err) {
      return { deny: `user_tasks: ${String(err)}` }
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const opened = await read($, openNotes)
    const all = await read($, tasks)
    const isHiding = await read($, isHidingDone)
    const doneCount = all.filter(t => t.done).length
    const list = isHiding ? all.filter(t => !t.done) : all
    const groups = [...new Set(list.map(t => t.group ?? ''))]

    return (
      <Box flexDirection="column" gap={2}>
        <Box gap={1}>
          <Text bold>Your tasks</Text>
          <Text dimColor>
            {doneCount}/{all.length} done
          </Text>
          {(doneCount > 0 || isHiding) && (
            <Button
              key="filter"
              label={isHiding ? 'Show done' : 'Hide done'}
              plain
              dimColor
              onPress={() => void update($, isHidingDone, hiding => !hiding)}
            />
          )}
          {doneCount > 0 && (
            <Button key="clear-done" label="Clear done" plain dimColor onPress={() => void change($, current, clearDone)} />
          )}
        </Box>
        {all.length === 0 && <Text dimColor>Nothing for you to check yet.</Text>}
        {all.length > 0 && list.length === 0 && <Text dimColor>All done. Show done lists them.</Text>}
        {groups.map(group => (
          <Box key={`group-${group}`} flexDirection="column" gap={1}>
            {group !== '' && <Markdown text={`# ${group.toUpperCase()}`} />}
            <Box flexDirection="column" gap={1}>
              {list
                .filter(t => (t.group ?? '') === group)
                .map(t => (
                  <Box key={`row-${t.id}`} flexDirection="column">
                    <Box>
                      <Box flexShrink={0}>
                        <Button
                          key={`task-${t.id}`}
                          label={t.done ? '☑' : '☐'}
                          plain
                          dimColor={t.done}
                          onPress={() => void change($, current, ts => toggle(ts, t.id))}
                        />
                      </Box>
                      <Box flexGrow={1} flexShrink={1}>
                        <Text bold dimColor={t.done} strikethrough={t.done}>
                          {t.title}
                        </Text>
                      </Box>
                      <Box flexShrink={0} paddingLeft={1}>
                        <Button
                          key={`ref-${t.id}`}
                          label={`↩ #${t.id}`}
                          plain
                          dimColor
                          onPress={press => void referTo($, t.id, press.surface)}
                        />
                      </Box>
                    </Box>
                    {t.detail && (
                      <Box paddingLeft={2}>
                        <Text dimColor strikethrough={t.done}>
                          {t.detail}
                        </Text>
                      </Box>
                    )}
                    {!t.done && (t.notes ?? []).length > 0 && (
                      <Box paddingLeft={2} flexWrap="wrap" columnGap={2}>
                        {(t.notes ?? []).map(n => (
                          <Button
                            key={`note-${n.id}`}
                            label={`${opened.includes(n.id) ? '▾' : '▸'} ${n.label}`}
                            plain
                            onPress={() => void toggleNote($, n.id)}
                          />
                        ))}
                      </Box>
                    )}
                    {!t.done &&
                      (t.notes ?? [])
                        .filter(n => opened.includes(n.id))
                        .map(n => (
                          <Box key={`block-${n.id}`} flexDirection="column" paddingLeft={2} marginTop={1}>
                            <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
                              <Button
                                key={`close-${n.id}`}
                                label={`▾ ${n.label}`}
                                plain
                                dimColor
                                onPress={() => void toggleNote($, n.id)}
                              />
                              <Markdown text={n.text} dimColor />
                            </Box>
                          </Box>
                        ))}
                  </Box>
                ))}
            </Box>
          </Box>
        ))}
      </Box>
    )
  })
}

/** Puts "Regarding user task #N, " in the prompt box at the cursor; without a box, on the clipboard. */
async function referTo($: EngineInterface, id: number, surface: RenderSurface) {
  const { text, cursor } = await $.prompt.read()
  const mention = `Regarding user task #${id}, `
  const needsSpace = cursor > 0 && !/\s/.test(text[cursor - 1] ?? ' ')
  const filled = await $.prompt.fill({ text: `${needsSpace ? ' ' : ''}${mention}`, mode: 'insert' })
  if (!filled.isFilled) {
    const copied = await $.ui.copy({ text: mention.trimEnd(), surface })
    $.ui.toast(copied.isCopied ? `Copied "${mention.trimEnd()}"` : `Could not copy "${mention.trimEnd()}"`)
  }
}

async function run($: EngineInterface, input: Input): Promise<string> {
  const project = input.project ? await projectOf($, input.project) : current

  switch (input.action) {
    case 'add': {
      const titles = (input.tasks ?? []).filter(t => t.title?.trim())
      if (titles.length === 0) {
        throw new Error('add needs tasks: [{ title, detail?, group?, notes? }]')
      }
      const added: Task[] = []
      await change($, project, (list, stored) => {
        for (const t of titles) {
          const task: Task = { id: stored.nextId++, title: t.title.trim(), done: false }
          if (t.detail?.trim()) task.detail = t.detail.trim()
          if (t.group?.trim()) task.group = t.group.trim()
          const notes = makeNotes(task.id, t.notes)
          if (notes.length > 0) task.notes = notes
          added.push(task)
        }
        return [...list, ...added]
      })
      void $.ui.open({ id: PANE, title: 'Your tasks' })

      return `Added ${added.length}: ${added.map(t => `#${t.id}`).join(', ')}`
    }
    case 'update': {
      let found = false
      await change($, project, list =>
        list.map(t => {
          if (t.id !== input.id) return t
          found = true
          const next: Task = { ...t }
          if (input.title?.trim()) next.title = input.title.trim()
          if (input.done !== undefined) next.done = input.done
          for (const key of ['detail', 'group'] as const) {
            if (input[key] === undefined) continue
            if (input[key].trim()) next[key] = input[key].trim()
            else delete next[key]
          }
          if (input.notes !== undefined) {
            const notes = makeNotes(t.id, input.notes)
            if (notes.length > 0) next.notes = notes
            else delete next.notes
          }
          return next
        }),
      )

      return found ? `Updated #${input.id}` : `No task #${input.id}`
    }
    case 'remove': {
      let found = false
      await change($, project, list => list.filter(t => t.id !== input.id || !(found = true)))

      return found ? `Removed #${input.id}` : `No task #${input.id}`
    }
    case 'clear': {
      let count = 0
      const clearAll = input.scope === 'all'
      await change($, project, list =>
        list.filter(t => {
          const isTarget = (clearAll || t.done) && (input.group === undefined || (t.group ?? '') === input.group)
          count += isTarget ? 1 : 0
          return !isTarget
        }),
      )

      return `Cleared ${count}`
    }
    case 'list': {
      const list = (await load($, project)).tasks.filter(t => input.group === undefined || (t.group ?? '') === input.group)
      return describe(list, project)
    }
    default:
      throw new Error('action must be add, update, remove, clear or list')
  }
}

function describe(list: Task[], project: string) {
  const open = list.filter(t => !t.done).length
  const out = [`${project}: ${open} open, ${list.length - open} done`]
  for (const group of new Set(list.map(t => t.group ?? ''))) {
    if (group !== '') out.push(group)
    for (const t of list.filter(one => (one.group ?? '') === group)) {
      const notes = t.notes?.length ? ` [notes: ${t.notes.map(n => n.label).join(', ')}]` : ''
      out.push(`  [${t.done ? 'x' : ' '}] #${t.id} ${t.title}${t.detail ? ` — ${t.detail}` : ''}${notes}`)
    }
  }

  return out.join('\n')
}

/** A task's notes as the tool gave them: blank ones dropped, text and label capped, ids `<task id>-<n>`. */
function makeNotes(taskId: number, given: NoteInput[] | undefined): Note[] {
  return (given ?? [])
    .filter(n => n.text?.trim())
    .map((n, i) => {
      const text = (n.text ?? '').trim()

      return {
        id: `${taskId}-${i}`,
        label: (n.label?.trim() || 'More').slice(0, MAX_LABEL),
        text: text.length > MAX_NOTE ? `${text.slice(0, MAX_NOTE).trimEnd()}…` : text,
      }
    })
}

/** Opens or closes a note, closing any other of the same task; an opened one is scrolled into view. */
async function toggleNote($: EngineInterface, id: string) {
  const isOpening = !(await read($, openNotes)).includes(id)
  await update($, openNotes, ids => {
    const others = ids.filter(one => one.split('-')[0] !== id.split('-')[0])

    return isOpening ? [...others, id] : others
  })
  if (isOpening) {
    await $.clock.sleep(100)
    await $.ui.scroll({ to: { key: `block-${id}` }, in: PANE, block: 'nearest' }).catch(() => undefined)
  }
}

const toggle = (list: Task[], id: number) => list.map(t => (t.id === id ? { ...t, done: !t.done } : t))
const clearDone = (list: Task[]) => list.filter(t => !t.done)

/** Read-modify-write of one project's list, one at a time; the pane follows when it is this session's. */
function change($: EngineInterface, project: string, fn: (list: Task[], stored: Stored) => Task[]) {
  const step = async () => {
    const stored = await load($, project)
    stored.tasks = fn(stored.tasks, stored)
    await $.store.set(keyOf(project), stored)
    if (project === current) {
      await update($, tasks, () => stored.tasks)
    }
  }
  queue = queue.then(step, step)

  return queue
}

/** Pulls the store into the pane, for a list another session wrote. */
async function refresh($: EngineInterface) {
  const stored = (await load($, current)).tasks
  if (JSON.stringify(stored) !== JSON.stringify(await read($, tasks))) {
    await update($, tasks, () => stored)
  }
}

async function load($: EngineInterface, project: string): Promise<Stored> {
  const stored = (await $.store.get(keyOf(project))) as Partial<Stored> | undefined

  return { nextId: stored?.nextId ?? 1, tasks: (stored?.tasks ?? []).map(migrate) }
}

/** Turns a task from the version that kept chat passages (`refs`, linked from its text) into one with notes. */
function migrate(task: Task): Task {
  const { refs, ...rest } = task
  if (!refs) return task
  const strip = (text: string) => text.replace(LEGACY_LINK, '$1')
  const migrated = refs.map((r, i) => ({ id: r.id, label: i === 0 ? 'More' : `More ${i + 1}`, text: r.text }))

  return {
    ...rest,
    title: strip(task.title),
    ...(task.detail ? { detail: strip(task.detail) } : {}),
    notes: [...(task.notes ?? []), ...migrated],
  }
}

/** A worktree shares its main repository's list. */
async function projectOf($: EngineInterface, dir: string) {
  const git = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: dir }).catch(() => undefined)
  const common = git?.exitCode === 0 ? norm(git.stdout) : ''

  return common.endsWith('/.git') ? common.slice(0, -'/.git'.length) : norm(dir)
}

const norm = (path: string) => path.trim().replaceAll('\\', '/').replace(/\/+$/, '')
const keyOf = (project: string) => `list:${project.toLowerCase()}`
