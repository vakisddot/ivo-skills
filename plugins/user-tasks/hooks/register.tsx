import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import type { Note, Task } from '../types'

type Stored = { nextId: number; tasks: Task[] }
type Input = {
  action?: 'add' | 'update' | 'remove' | 'clear' | 'list'
  project?: string
  tasks?: { title: string; detail?: string; group?: string }[]
  id?: number
  title?: string
  detail?: string
  group?: string
  done?: boolean
  scope?: 'done' | 'all'
}

const PANE = 'user-tasks'
const TOOL = 'mcp__user-tasks__user_tasks'
const POLL_MS = 2000
const MAX_NOTE = 2000
const MAX_LABEL = 40
/** The eye, with the text variation selector so it draws as a plain glyph, not a colour emoji. */
const EYE = '\u{1F441}\uFE0E'

const tasks = atom({ plugin: 'user-tasks', key: 'tasks' } as const, [])
const isHidingDone = atom({ plugin: 'user-tasks', key: 'isHidingDone' } as const, false)
/** The notes open now, by note id: at most one per task (note ids are `<task id>-<n>`). */
const openNotes = atom({ plugin: 'user-tasks', key: 'openNotes' } as const, [])

/** Claude writes `{{label|text}}` in a title or detail; it is stored as `[label](REF_HOST<note id>)` and a note. */
const REF_HOST = 'https://user-tasks.invalid/'
const NOTE_MARK = /\{\{([^|{}]+)\|([\s\S]*?)\}\}/g
const NOTE_LINK = /\[([^\]]+)\]\(https:\/\/user-tasks\.invalid\/[^)\s]+\)/g

// Module state. A reload re-runs session.start, which sets it again.
let current = ''
let queue: Promise<unknown> = Promise.resolve()

const DETAIL_HELP =
  'One line: what to look for. May hold {{label|text}}: it shows as a link labelled `label` that Ivo clicks to open `text` '
  + '(markdown, up to 2000 characters) in a framed block under the task. Use it for background you would otherwise paste in chat; '
  + 'several per task are fine.'

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
          title: { type: 'string', description: 'Short imperative title. May hold {{label|text}} notes, as detail.' },
          detail: { type: 'string', description: DETAIL_HELP },
          group: { type: 'string', description: 'Section heading, e.g. "Verify login fix".' },
        },
        required: ['title'],
      },
    },
    id: { type: 'number', description: 'update, remove: the item id.' },
    title: { type: 'string', description: 'update: new title.' },
    detail: { type: 'string', description: `update: new detail; "" removes it. ${DETAIL_HELP}` },
    group: { type: 'string', description: 'update: new group, "" ungroups; clear, list: only this group.' },
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
        + 'Actions: add {tasks:[{title,detail?,group?}]}, update {id,title?,detail?,group?,done?}, '
        + 'remove {id}, clear {scope?:"done"|"all",group?}, list {group?} (returns what Ivo has ticked). '
        + 'Titles and details may hold {{label|text}}: a link Ivo clicks to open text under the task, for context you would otherwise paste in chat. '
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
    const words = (key: string, value: string, isDone: boolean, isTitle = false) =>
      isDone ? (
        <Text bold={isTitle} dimColor strikethrough>
          {plain(value)}
        </Text>
      ) : (
        <Markdown
          key={key}
          text={isTitle ? bold(value) : value}
          dimColor={!isTitle}
          onLinkPress={link => void toggleNote($, link.href.slice(REF_HOST.length))}
        />
      )
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
            ✓ {doneCount}/{all.length} done
          </Text>
          {(doneCount > 0 || isHiding) && (
            <Button
              key="filter"
              label={isHiding ? `${EYE} Show done` : `${EYE} Hide done`}
              plain
              dimColor
              onPress={() => void update($, isHidingDone, hiding => !hiding)}
            />
          )}
          {doneCount > 0 && (
            <Button key="clear-done" label="✕ Clear done" plain dimColor onPress={() => void change($, current, clearDone)} />
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
                        {words(`title-${t.id}`, t.title, t.done, true)}
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
                    {t.detail && <Box paddingLeft={2}>{words(`detail-${t.id}`, t.detail, t.done)}</Box>}
                    {!t.done &&
                      (t.notes ?? [])
                        .filter(n => opened.includes(n.id))
                        .map(n => (
                          <Box key={`block-${n.id}`} flexDirection="column" paddingLeft={2} marginTop={1}>
                            <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap={1}>
                              <Box>
                                <Box flexGrow={1} flexShrink={1}>
                                  <Text bold dimColor>
                                    {n.label}
                                  </Text>
                                </Box>
                                <Box flexShrink={0} paddingLeft={1}>
                                  <Button
                                    key={`close-${n.id}`}
                                    label="✕"
                                    plain
                                    dimColor
                                    onPress={() => void toggleNote($, n.id)}
                                  />
                                </Box>
                              </Box>
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
        throw new Error('add needs tasks: [{ title, detail?, group? }]')
      }
      const added: Task[] = []
      await change($, project, (list, stored) => {
        for (const t of titles) {
          const task: Task = { id: stored.nextId++, title: '', done: false }
          const notes: Note[] = []
          task.title = withNotes(t.title.trim(), task.id, notes)
          if (t.detail?.trim()) task.detail = withNotes(t.detail.trim(), task.id, notes)
          if (t.group?.trim()) task.group = t.group.trim()
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
          const notes: Note[] = [...(t.notes ?? [])]
          if (input.title?.trim()) next.title = withNotes(input.title.trim(), t.id, notes)
          if (input.done !== undefined) next.done = input.done
          for (const key of ['detail', 'group'] as const) {
            if (input[key] === undefined) continue
            if (input[key].trim()) next[key] = key === 'detail' ? withNotes(input[key].trim(), t.id, notes) : input[key].trim()
            else delete next[key]
          }
          const kept = notes.filter(n => `${next.title}\n${next.detail ?? ''}`.includes(`${REF_HOST}${n.id})`))
          if (kept.length > 0) next.notes = kept
          else delete next.notes
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
      out.push(`  [${t.done ? 'x' : ' '}] #${t.id} ${marked(t.title)}${t.detail ? ` — ${marked(t.detail)}` : ''}`)
    }
  }

  return out.join('\n')
}

/** Turns each `{{label|text}}` into a link to a note kept on the task; a blank text leaves the plain label. */
function withNotes(text: string, taskId: number, notes: Note[]) {
  return text.replace(NOTE_MARK, (_, rawLabel: string, rawText: string) => {
    const label = rawLabel.replace(/[[\]]/g, '').trim().slice(0, MAX_LABEL) || 'More'
    const body = rawText.trim()
    if (!body) return label
    const id = `${taskId}-${notes.reduce((n, note) => Math.max(n, Number(note.id.split('-')[1]) + 1), 0)}`
    notes.push({ id, label, text: body.length > MAX_NOTE ? `${body.slice(0, MAX_NOTE).trimEnd()}…` : body })

    return `[${label}](${REF_HOST}${id})`
  })
}
/** A title in bold, its link labels too, which markdown would otherwise leave regular. */
const bold = (text: string) => `**${text.replace(NOTE_LINK, link => link.replace('[', '[**').replace('](', '**]('))}**`
const plain = (text: string) => text.replace(NOTE_LINK, '$1')
const marked = (text: string) => text.replace(NOTE_LINK, '$1 ↗')

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

/**
 * Reads a task saved by an earlier version: a chat passage (`refs`) becomes a note, labelled as the link to it in
 * the task's text, and a note nothing links to is dropped.
 */
function migrate(task: Task): Task {
  const { refs, ...rest } = task
  const text = `${task.title}\n${task.detail ?? ''}`
  const labels = new Map([...text.matchAll(/\[([^\]]+)\]\(https:\/\/user-tasks\.invalid\/([^)\s]+)\)/g)].map(m => [m[2], m[1]]))
  const labelOf = (id: string) => labels.get(id) ?? 'More'
  const all = [...(task.notes ?? []), ...(refs ?? []).map(r => ({ id: r.id, label: labelOf(r.id), text: r.text }))]
  const notes = all.filter(n => text.includes(`${REF_HOST}${n.id})`))
  if (!refs && notes.length === (task.notes ?? []).length) return task

  return notes.length > 0 ? { ...rest, notes } : (({ notes: _, ...bare }) => bare)(rest)
}

/** A worktree shares its main repository's list. */
async function projectOf($: EngineInterface, dir: string) {
  const git = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: dir }).catch(() => undefined)
  const common = git?.exitCode === 0 ? norm(git.stdout) : ''

  return common.endsWith('/.git') ? common.slice(0, -'/.git'.length) : norm(dir)
}

const norm = (path: string) => path.trim().replaceAll('\\', '/').replace(/\/+$/, '')
const keyOf = (project: string) => `list:${project.toLowerCase()}`
