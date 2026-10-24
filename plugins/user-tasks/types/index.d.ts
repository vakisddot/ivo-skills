/** One thing Claude asked the person to check or do. */
export type Task = {
  id: number
  title: string
  detail?: string
  group?: string
  done: boolean
}

declare module 'claude-code' {
  interface PluginState {
    /** The session's project list, mirrored from `$.store`, and whether the pane hides the ticked ones. */
    'user-tasks': { tasks: Task[]; isHidingDone: boolean }
  }
}
