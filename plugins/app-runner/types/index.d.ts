/** What the band above the prompt shows; `off` when the checkout has no run.json. */
export type RunnerView = {
  phase: 'off' | 'idle' | 'building' | 'running'
  profile: string
  branch: string
}

declare module 'claude-code' {
  interface PluginState {
    'app-runner': { view: RunnerView }
  }
}
