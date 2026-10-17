import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RunnerView } from '../types'

type Profile = { name: string; build?: string[]; run: [string, ...string[]]; cwd?: string }
type RunConfig = { profiles: Profile[] }
type Running = { profile: string; pid?: number; isStopping: boolean }

const CONFIG_PATH = '.claude/run.json'
const BUILD_TIMEOUT_MS = 600_000
const MAX_ERROR_LINES = 10
const CRASH_TAIL_LINES = 15

const IDLE: RunnerView = { phase: 'idle', profile: '', branch: '' }
const view = atom({ plugin: 'app-runner', key: 'view' } as const, { ...IDLE, phase: 'off' })
const isHidden = atom({ plugin: 'app-runner', key: 'isHidden' } as const, false)

// Module state. A reload forgets it, and the app keeps running untracked: stop that one by hand.
let running: Running | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'ivo-runner-start',
      description: `Build and run this checkout (${CONFIG_PATH})`,
      argumentHint: '[profile]',
      immediate: true,
    })
    await $.command.register({
      name: 'ivo-runner-stop',
      description: 'Stop the app started by /ivo-runner-start',
      immediate: true,
    })
    await $.command.register({
      name: 'ivo-runner-toggle',
      description: 'Show or hide the Start/Stop band',
      immediate: true,
    })

    // Also runs on reload, which killed any child, so the view restarts from idle.
    const hasConfig = await $.fs.exists(`${await $.session.root()}/${CONFIG_PATH}`)
    await update($, view, () => (hasConfig ? IDLE : { ...IDLE, phase: 'off' }))

    return next(e)
  })

  on('command.run', { command: 'ivo-runner-start' }, async ($, e) => ({ text: await start($, e.args) }))
  on('command.run', { command: 'ivo-runner-stop' }, async $ => ({ text: await stop($) }))
  on('command.run', { command: 'ivo-runner-toggle' }, async $ => {
    const isNowHidden = !(await read($, isHidden))
    await update($, isHidden, () => isNowHidden)

    return { text: isNowHidden ? 'Runner band hidden. /ivo-runner-toggle shows it again.' : 'Runner band shown.' }
  })

  // Drawn in the band above the prompt: the desktop's footer slot no longer sits beside the model picker.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, view)
    if (shown.phase === 'off' || e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        {shown.phase === 'idle' && (
          <Button key="start" label="▶ Start" plain onPress={async () => $.ui.toast(await start($, ''))} />
        )}
        {shown.phase === 'building' && <Text dimColor>Building {shown.profile}…</Text>}
        {shown.phase === 'running' && (
          <>
            <Text>
              ▶ {shown.profile} · {shown.branch}{' '}
            </Text>
            <Button key="stop" label="■ Stop" plain onPress={async () => $.ui.toast(await stop($))} />
          </>
        )}
        <Button key="hide" label="Hide" plain onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}

async function start($: EngineInterface, args: string) {
  if (running) {
    return `${running.profile} is already running. Use /ivo-runner-stop first.`
  }

  const root = await $.session.root()
  let config: RunConfig
  try {
    config = JSON.parse(await $.fs.read(`${root}/${CONFIG_PATH}`))
  } catch (err) {
    return `Cannot read ${CONFIG_PATH} in ${root}: ${String(err)}`
  }

  const wanted = args.trim().toLowerCase()
  const profile = wanted ? config.profiles.find(p => p.name.toLowerCase() === wanted) : config.profiles[0]
  if (!profile) {
    return `No profile "${args.trim()}". Profiles: ${config.profiles.map(p => p.name).join(', ')}`
  }

  running = { profile: profile.name, isStopping: false }
  void launch($, root, profile, running)

  return `${profile.build ? 'Building' : 'Starting'} ${profile.name} from ${root}`
}

async function stop($: EngineInterface) {
  if (!running) {
    return 'Nothing is running.'
  }
  if (running.pid === undefined) {
    return `${running.profile} is still building; stop it once it starts.`
  }

  running.isStopping = true
  const killed = await $.process.run(['taskkill', '/PID', String(running.pid), '/T', '/F'])

  return killed.exitCode === 0 ? `Stopped ${running.profile}.` : `taskkill failed: ${killed.stderr.trim()}`
}

async function launch($: EngineInterface, root: string, profile: Profile, state: Running) {
  try {
    if (profile.build) {
      await update($, view, () => ({ ...IDLE, phase: 'building', profile: profile.name }))
      const built = await $.process.run(profile.build, { cwd: root, timeoutMs: BUILD_TIMEOUT_MS })
      if (built.exitCode !== 0) {
        const errors = [...new Set(lines(built.stdout + built.stderr).filter(l => /\berror\b/i.test(l)))]
        $.ui.log(`${profile.name}: build failed (exit ${built.exitCode})\n${errors.slice(0, MAX_ERROR_LINES).join('\n')}`)
        $.ui.toast(`${profile.name}: build failed`)
        return
      }
    }

    const branch = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root })
    const [exe, ...args] = profile.run
    // The host starts children with their window hidden, so launch through Start-Process to show it,
    // print the app's PID for /ivo-runner-stop, and pass its exit code through.
    const script = [
      `$p = Start-Process -PassThru -FilePath ${quote(/[\\/]/.test(exe) ? resolve(root, exe) : exe)}`
        + ` -WorkingDirectory ${quote(profile.cwd ? resolve(root, profile.cwd) : root)}`
        + (args.length > 0 ? ` -ArgumentList ${args.map(quote).join(',')}` : ''),
      '$null = $p.Handle', // Caches the handle so ExitCode is readable after the wait.
      'Write-Output $p.Id',
      '$p.WaitForExit()',
      'exit $p.ExitCode',
    ].join('; ')
    const child = $.process.spawn({ argv: ['powershell', '-NoProfile', '-NonInteractive', '-Command', script] })

    // The first stdout line is the PID; the rest is launcher errors, kept for the failure report.
    let tail: string[] = []
    for await (const { stream, text } of child) {
      const pid = Number(text.trim())
      if (state.pid === undefined && stream === 'stdout' && Number.isInteger(pid) && pid > 0) {
        state.pid = pid
        await update($, view, () => ({ phase: 'running', profile: profile.name, branch: branch.stdout.trim() || root }))
        continue
      }
      tail = [...tail, ...lines(text)].slice(-CRASH_TAIL_LINES)
    }

    const { code } = await child.result
    if (code !== 0 && !state.isStopping) {
      $.ui.log(`${profile.name} exited with code ${code}\n${tail.join('\n')}`)
      $.ui.toast(`${profile.name} exited with code ${code}`)
    }
  } catch (err) {
    if (!state.isStopping) {
      $.ui.log(`${profile.name}: ${String(err)}`)
    }
  } finally {
    running = undefined
    await update($, view, () => IDLE)
  }
}

function resolve(root: string, path: string) {
  return /^([A-Za-z]:)?[\\/]/.test(path) ? path : `${root}/${path}`
}

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function lines(text: string) {
  return text.split(/\r?\n/).filter(l => l.trim() !== '')
}
