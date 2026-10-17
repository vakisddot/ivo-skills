import { expect, test } from 'claude-code/testing'

const CONFIG = JSON.stringify({ profiles: [{ name: 'Game', run: ['game.exe'] }] })
const RUN = { args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { bodyRows: 10 }, view: {} },
} as const

test('/ivo-runner-stop with nothing running says so', async $ => {
  const { text } = await $.command.run({ ...RUN, command: 'ivo-runner-stop' })

  expect(text).toBe('Nothing is running.')
})

test('/ivo-runner-start without a config reports the missing file', async ($, on) => {
  on('session.root', () => ({ value: 'C:/repo' }))
  on('fs.read', () => ({ deny: 'ENOENT' }))

  const { text } = await $.command.run({ ...RUN, command: 'ivo-runner-start' })

  expect(text).toContain('Cannot read .claude/run.json in C:/repo')
})

test('/ivo-runner-start with an unknown profile lists the profiles', async ($, on) => {
  on('session.root', () => ({ value: 'C:/repo' }))
  on('fs.read', () => ({ value: CONFIG }))

  const { text } = await $.command.run({ ...RUN, command: 'ivo-runner-start', args: 'editor' })

  expect(text).toBe('No profile "editor". Profiles: Game')
})

test('the band offers Start only when the checkout has a run.json', async ($, on) => {
  let hasConfig = false
  on('session.root', () => ({ value: 'C:/repo' }))
  on('fs.exists', () => ({ value: hasConfig }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const exists of [false, true]) {
      hasConfig = exists
      await $.session.start({ cwd: 'C:/repo', surface, isInteractive: true })
      const ui = await $.ui.mount({ plugin: 'app-runner', surface, ...BAND })
      expect((await ui.find({ key: 'start' })) !== undefined).toBe(exists)
      await ui.unmount()
    }
  }
})

test('Hide removes the band and /ivo-runner-toggle brings it back', async ($, on) => {
  on('session.root', () => ({ value: 'C:/repo' }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: CONFIG }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  await $.session.start({ cwd: 'C:/repo', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'app-runner', surface: 'desktop', ...BAND })
  expect((await ui.find({ key: 'start' })) !== undefined).toBe(true)

  await ui.press({ key: 'hide' })
  expect(await ui.find({ key: 'start' })).toBeUndefined()

  await $.command.run({ ...RUN, command: 'ivo-runner-toggle' })
  expect((await ui.find({ key: 'start' })) !== undefined).toBe(true)
  await ui.unmount()
})
