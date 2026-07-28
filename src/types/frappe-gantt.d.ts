declare module 'frappe-gantt' {
  export interface GanttTaskInput {
    id: string
    name: string
    start: string
    end: string
    dependencies?: string
    custom_class?: string
    progress?: number
  }

  export interface GanttOptions {
    view_mode?: 'Day' | 'Week' | 'Month' | 'Year'
    view_mode_select?: boolean
    on_click?: (task: GanttTaskInput) => void
    on_date_change?: (task: GanttTaskInput, start: Date, end: Date) => void
    [key: string]: unknown
  }

  export default class Gantt {
    constructor(wrapper: HTMLElement | SVGElement | string, tasks: GanttTaskInput[], options?: GanttOptions)
    refresh(tasks: GanttTaskInput[]): void
    change_view_mode(mode: string): void
  }
}
