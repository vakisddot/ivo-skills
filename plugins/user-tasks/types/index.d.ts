/** A passage of the chat kept with a task, opened by the link `[label](https://user-tasks.invalid/<id>)`. */
export type Ref = { id: string; text: string }

/** One thing Claude asked the person to check or do. */
export type Task = {
  id: number
  title: string
  detail?: string
  group?: string
  done: boolean
  refs?: Ref[]
}

declare module 'claude-code' {
  interface PluginState {
    /** The session's project list, mirrored from `$.store`, and whether the pane hides the ticked ones. */
    'user-tasks': { tasks: Task[]; isHidingDone: boolean; openRefs: string[]; anim: { id: string; height: number } | null }
  }
}
