import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import type { Task } from '../types'

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

const tasks = atom({ plugin: 'user-tasks', key: 'tasks' } as const, [])
const isHidingDone = atom({ plugin: 'user-tasks', key: 'isHidingDone' } as const, false)

/** A link to a chat row is stored as `[label](REF_HOST<row id>)`; Claude writes `[label](here)` or `[label](prev)`. */
const REF_HOST = 'https://user-tasks.invalid/'
const REF_MARK = /\[([^\]]+)\]\((here|prev)\)/g
const REF_LINK = /\[([^\]]+)\]\(https:\/\/user-tasks\.invalid\/[^)\s]+\)/g

// Module state. A reload re-runs session.start, which sets it again.
let current = ''
let lastMessage = ''
let queue: Promise<unknown> = Promise.resolve()

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
          detail: {
            type: 'string',
            description:
              'One line: what to look for. May hold links back into this chat: [label](here) is this call, '
              + '[label](prev) the text you wrote just before it. Use sparingly, only where a passage explains the task.',
          },
          group: { type: 'string', description: 'Section heading, e.g. "Verify login fix".' },
        },
        required: ['title'],
      },
    },
    id: { type: 'number', description: 'update, remove: the item id.' },
    title: { type: 'string', description: 'update: new title.' },
    detail: { type: 'string', description: 'update: new detail; "" removes it.' },
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
        + 'Actions: add {tasks:[{title,detail?,group?}]}, update {id,title?,detail?,group?,done?}, remove {id}, '
        + 'clear {scope?:"done"|"all",group?}, list {group?} (returns what Ivo has ticked). '
        + 'Optional project: folder path of another project. '
        + 'Titles and details may hold [label](here) or [label](prev) links that Ivo can click to jump back to this chat. '
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
      return { result: await run($, e as Input, e.tool_use_id) }
    } catch (err) {
      return { deny: `user_tasks: ${String(err)}` }
    }
  })

  // The latest reply block drawn is the text Claude wrote just before a call, which `(prev)` points at.
  on('ui.render', { component: 'AssistantMessage' }, (_, e, next) => {
    lastMessage = e.requestId

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const words = (key: string, value: string, isDone: boolean) =>
      !value.includes(REF_HOST) ? (
        <Text dimColor={isDone} strikethrough={isDone}>
          {value}
        </Text>
      ) : isDone ? (
        <Text dimColor strikethrough>
          {plain(value)}
        </Text>
      ) : (
        <Markdown key={key} text={value} onLinkPress={link => void jumpTo($, link.href)} />
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
            {group !== '' && <Text bold>{group}</Text>}
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
                      {words(`title-${t.id}`, t.title, t.done)}
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
                      {words(`detail-${t.id}`, t.detail, t.done)}
                    </Box>
                  )}
                </Box>
              ))}
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

async function run($: EngineInterface, input: Input, callId: string | undefined): Promise<string> {
  const refs = (text: string) => withRefs(text, callId)
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
          const task: Task = { id: stored.nextId++, title: refs(t.title.trim()), done: false }
          if (t.detail?.trim()) task.detail = refs(t.detail.trim())
          if (t.group?.trim()) task.group = t.group.trim()
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
          if (input.title?.trim()) next.title = refs(input.title.trim())
          if (input.done !== undefined) next.done = input.done
          for (const key of ['detail', 'group'] as const) {
            if (input[key] === undefined) continue
            if (input[key].trim()) next[key] = key === 'detail' ? refs(input[key].trim()) : input[key].trim()
            else delete next[key]
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
      out.push(`  [${t.done ? 'x' : ' '}] #${t.id} ${marked(t.title)}${t.detail ? ` — ${marked(t.detail)}` : ''}`)
    }
  }

  return out.join('\n')
}

/** Turns `[label](here)` / `[label](prev)` into links to the chat row of this call, or the reply text before it. */
const withRefs = (text: string, callId: string | undefined) =>
  text.replace(REF_MARK, (_, label: string, to: string) => {
    const row = to === 'prev' ? lastMessage || callId : callId

    return row ? `[${label}](${REF_HOST}${encodeURIComponent(row)})` : label
  })
const plain = (text: string) => text.replace(REF_LINK, '$1')
const marked = (text: string) => text.replace(REF_LINK, '$1 ↗')

/** Scrolls the chat to the row a task link names; the row can be gone from this session. */
async function jumpTo($: EngineInterface, href: string) {
  const requestId = decodeURIComponent(href.slice(REF_HOST.length))
  const moved = await $.ui.scroll({ to: { requestId }, block: 'center' }).catch(err => ({ deny: String(err) }))
  if ('deny' in moved && moved.deny) {
    $.ui.toast(`That part of the chat is not available in this session (${moved.deny}; row ${requestId}).`)
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

  return { nextId: stored?.nextId ?? 1, tasks: stored?.tasks ?? [] }
}

/** A worktree shares its main repository's list. */
async function projectOf($: EngineInterface, dir: string) {
  const git = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: dir }).catch(() => undefined)
  const common = git?.exitCode === 0 ? norm(git.stdout) : ''

  return common.endsWith('/.git') ? common.slice(0, -'/.git'.length) : norm(dir)
}

const norm = (path: string) => path.trim().replaceAll('\\', '/').replace(/\/+$/, '')
const keyOf = (project: string) => `list:${project.toLowerCase()}`
