import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const TOOL = 'mcp__user-tasks__user_tasks'
const PANE = {
  plugin: 'user-tasks',
  component: 'Pane',
  requestId: 'user-tasks',
  props: {
    title: 'Your tasks',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

let opens = 0

/** Stands in for the engine under the mod: a repo at C:/Repo; a folder under worktrees/ shares its git dir. */
const engine = (on: On, store: Record<string, unknown> = {}) => {
  opens = 0
  const clock = mock.clock(on)
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('session.root', () => ({ value: 'C:/Repo' }))
  on('process.run', (_, e) => {
    const cwd = String(e.init?.cwd).replaceAll('\\', '/')
    const common = cwd.includes('/worktrees/') ? 'C:/Repo/.git' : `${cwd}/.git`

    return { value: { exitCode: 0, stdout: `${common}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', () => ({ value: { tool: TOOL } }))
  on('ui.open', () => {
    opens += 1
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  return clock
}

const call = ($: Engine, input: object) =>
  $.tool.call({ tool: TOOL, ...input } as never).then(r => (r as { result?: string }).result ?? (r as { deny?: string }).deny)

test('Claude adds grouped tasks, Ivo ticks one, Claude reads it back', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:/Repo', surface: 'desktop', isInteractive: true })

  const added = await call($, {
    action: 'add',
    tasks: [
      { title: 'Check login', detail: 'redirects to the home page', group: 'Verify login fix' },
      { title: 'Check logout', group: 'Verify login fix' },
      { title: 'Reply to the reviewer' },
    ],
  })
  expect(added).toBe('Added 3: #1, #2, #3')

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /0\/3 done/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Verify login fix/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /redirects to the home page/ })).toBeDefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'task-2' })
  expect(await ui.find({ type: 'Text', text: /1\/3 done/ })).toBeDefined()
  await ui.unmount()

  const listed = await call($, { action: 'list' })
  expect(listed).toContain('1 done')
  expect(listed).toContain('[x] #2 Check logout')
  expect(listed).toContain('[ ] #1 Check login — redirects to the home page')
})

test('update, remove and clear', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:/Repo', surface: 'desktop', isInteractive: true })
  await call($, { action: 'add', tasks: [{ title: 'a', group: 'G' }, { title: 'b', group: 'G' }, { title: 'c' }] })

  expect(await call($, { action: 'update', id: 1, done: true, detail: 'seen' })).toBe('Updated #1')
  expect(await call($, { action: 'update', id: 9, done: true })).toBe('No task #9')
  expect(await call($, { action: 'remove', id: 3 })).toBe('Removed #3')
  expect(await call($, { action: 'clear' })).toBe('Cleared 1')

  const listed = await call($, { action: 'list' })
  expect(listed).not.toContain('#1')
  expect(listed).toContain('#2 b')
  expect(await call($, { action: 'clear', scope: 'all', group: 'G' })).toBe('Cleared 1')
  expect(await call($, { action: 'add', tasks: [{ title: 'd' }] })).toBe('Added 1: #4')
})

test('a bad call is refused with a reason', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:/Repo', surface: 'desktop', isInteractive: true })

  expect(await call($, { action: 'add', tasks: [] })).toContain('add needs tasks')
  expect(await call($, { action: 'nope' })).toContain('action must be')
})

test('the list survives a restart and is per project', async ($, on) => {
  engine(on, {
    'list:c:/repo': { nextId: 2, tasks: [{ id: 1, title: 'Old task', done: true }] },
    'list:c:/other': { nextId: 2, tasks: [{ id: 1, title: 'Other project', done: false }] },
  })
  await $.session.start({ cwd: 'C:/Repo', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /1\/1 done/ })).toBeDefined()
  expect(await ui.find({ key: 'task-1' })).toBeDefined()
  await ui.unmount()

  expect(await call($, { action: 'list' })).toContain('Old task')
  expect(await call($, { action: 'list', project: 'C:\\Other' })).toContain('Other project')
})

test('a worktree shares its main repository list', async ($, on) => {
  engine(on, { 'list:c:/repo': { nextId: 2, tasks: [{ id: 1, title: 'Shared', done: false }] } })
  await $.session.start({ cwd: 'C:/Repo/.claude/worktrees/x', surface: 'desktop', isInteractive: true })

  expect(await call($, { action: 'list' })).toContain('Shared')
})

test('a list another session wrote appears in the pane', async ($, on) => {
  // Another session's write lands in the store behind this one's back.
  const shared: Record<string, unknown> = {}
  const clock = engine(on, shared)
  await $.session.start({ cwd: 'C:/Repo', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Nothing for you/ })).toBeDefined()

  shared['list:c:/repo'] = { nextId: 2, tasks: [{ id: 1, title: 'From elsewhere', done: false }] }
  await clock.advance(2500)

  expect(await ui.find({ key: 'task-1' })).toBeDefined()
  await ui.unmount()
})

test('/ivo-tasks reopens the pane', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:/Repo', surface: 'desktop', isInteractive: true })
  const before = opens

  const { text } = await $.command.run({ command: 'ivo-tasks', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  expect(text).toContain('Opened')
  expect(opens).toBe(before + 1)
})

test('ticked tasks are struck through and the filter hides them', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: 'C:/Repo', surface: 'desktop', isInteractive: true })
  await call($, { action: 'add', tasks: [{ title: 'Check login', detail: 'redirects' }, { title: 'Check logout' }] })
  await call($, { action: 'update', id: 1, done: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: 'filter' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^Check login$/ }))?.props?.strikethrough).toBe(true)
    expect((await ui.find({ type: 'Text', text: /^Check logout$/ }))?.props?.strikethrough).toBe(false)
    expect((await ui.find({ type: 'Text', text: /redirects/ }))?.props?.strikethrough).toBe(true)
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'filter' })
  expect(await ui.find({ key: 'task-1' })).toBeUndefined()
  expect(await ui.find({ key: 'task-2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1\/2 done/ })).toBeDefined()

  await call($, { action: 'update', id: 2, done: true })
  expect(await ui.find({ type: 'Text', text: /All done/ })).toBeDefined()
  await ui.press({ key: 'filter' })
  expect(await ui.find({ key: 'task-1' })).toBeDefined()
  await ui.unmount()
})

test('clicking #N puts "User task #N" in the prompt box, or on the clipboard', async ($, on) => {
  engine(on)
  let draft = { text: 'see', cursor: 3 }
  let isBoxOpen = true
  const filled: string[] = []
  const copied: string[] = []
  on('prompt.read', () => ({ value: draft }))
  on('prompt.fill', (_, e) => {
    if (!isBoxOpen) return { isFilled: false, refusal: 'dialog' as const }
    filled.push(e.text)
    return { isFilled: true }
  })
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true as const } }
  })
  await $.session.start({ cwd: 'C:/Repo', surface: 'desktop', isInteractive: true })
  await call($, { action: 'add', tasks: [{ title: 'Check login' }, { title: 'Check logout' }] })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'ref-2' })
  expect(filled).toEqual([' User task #2 '])

  draft = { text: '', cursor: 0 }
  await ui.press({ key: 'ref-1' })
  expect(filled[1]).toBe('User task #1 ')

  isBoxOpen = false
  await ui.press({ key: 'ref-1' })
  expect(copied).toEqual(['User task #1'])
  await ui.unmount()
})
