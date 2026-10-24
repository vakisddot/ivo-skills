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

declare module 'claude-code' {
  interface PluginState {
    /** The session's project list, mirrored from `$.store`, whether the pane hides the ticked ones, and the open notes. */
    'user-tasks': { tasks: Task[]; isHidingDone: boolean; openNotes: string[] }
  }
}
