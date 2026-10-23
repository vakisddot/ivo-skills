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
    /** The session's project list, mirrored from `$.store` for the pane to draw. */
    'user-tasks': { tasks: Task[] }
  }
}
