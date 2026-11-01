/** Text behind a link in a task's title or detail (`[label](https://user-tasks.invalid/<id>)`), opened in the pane. */
export type Note = { id: string; label: string; text: string }

/** What an earlier version kept per task: a chat passage, linked from the task's text. Read once, as a note. */
export type Ref = { id: string; text: string }

/** One thing Claude asked the person to check or do. */
export type Task = {
  id: number
  title: string
  detail?: string
  group?: string
  done: boolean
  notes?: Note[]
  refs?: Ref[]
}

/** What the run controls in the band show; `off` when the checkout has no `.claude/run.json`. */
export type RunnerView = {
  phase: 'off' | 'idle' | 'building' | 'running'
  profile: string
  branch: string
}

declare module 'claude-code' {
  interface PluginState {
    /**
     * The session's project list, mirrored from `$.store`, whether the pane hides the ticked ones, the open notes,
     * whether the pane is open and drawn (the band's reopen button shows while it is not), the run controls' view,
     * the run profiles and the one chosen, and whether the person hid the whole band.
     */
    'user-tasks': {
      tasks: Task[]
      isHidingDone: boolean
      openNotes: string[]
      isPaneShown: boolean
      runView: RunnerView
      runProfiles: string[]
      runChoice: string
      isBandHidden: boolean
    }
  }
}
