import PptxGenJS from 'pptxgenjs'
import { toPng } from 'html-to-image'
import type { AppState, Task } from '../types'
import { formatDateOnly, formatTimestamp, nowTimestamp } from './dates'

const STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
}
const CAPACITY_LABEL: Record<string, string> = { green: 'Green', yellow: 'Yellow', red: 'Red' }
const CAPACITY_COLOR: Record<string, string> = { green: '22C55E', yellow: 'EAB308', red: 'EF4444' }

function addSummarySlide(pptx: PptxGenJS, state: AppState) {
  const slide = pptx.addSlide()
  slide.addText('SideTrack Status Report', { x: 0.5, y: 0.35, w: 12, fontSize: 28, bold: true })
  slide.addText(formatTimestamp(nowTimestamp()), { x: 0.5, y: 1.0, w: 12, fontSize: 14, color: '666666' })

  slide.addText('Team capacity', { x: 0.5, y: 1.7, w: 12, fontSize: 16, bold: true })

  const rows: PptxGenJS.TableRow[] = state.users
    .filter((u) => u.active)
    .map((u) => [
      { text: CAPACITY_LABEL[u.capacity.status] ?? u.capacity.status, options: { color: CAPACITY_COLOR[u.capacity.status] ?? '666666', bold: true } },
      { text: u.name },
      { text: u.capacity.note ?? '' },
    ])

  if (rows.length > 0) {
    slide.addTable(rows, { x: 0.5, y: 2.2, w: 11, colW: [1.5, 3, 6.5], fontSize: 12, border: { type: 'solid', color: 'DDDDDD', pt: 0.5 } })
  }
}

async function addGanttSlide(pptx: PptxGenJS, ganttElement: HTMLElement) {
  const dataUrl = await toPng(ganttElement, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
  const slide = pptx.addSlide()
  slide.addText('Timeline', { x: 0.5, y: 0.3, fontSize: 20, bold: true })

  // Fit the (possibly very wide) capture into the remaining slide area,
  // preserving aspect ratio. A dedicated per-quarter multi-slide split for
  // very long timelines is left as a future refinement — this always
  // produces a valid, readable single slide instead.
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Could not measure captured Gantt image'))
    img.src = dataUrl
  })
  const maxW = 12.3
  const maxH = 6.5
  const ratio = Math.min(maxW / img.width, maxH / img.height)
  const w = img.width * ratio
  const h = img.height * ratio

  slide.addImage({ data: dataUrl, x: (13.33 - w) / 2, y: 1.0, w, h })
}

function addTaskSlides(pptx: PptxGenJS, state: AppState) {
  const usersById = new Map(state.users.map((u) => [u.id, u]))
  const byAssignee = new Map<string, Task[]>()
  for (const task of state.tasks) {
    const key = task.assigneeId ?? 'unassigned'
    if (!byAssignee.has(key)) byAssignee.set(key, [])
    byAssignee.get(key)!.push(task)
  }

  const header: PptxGenJS.TableRow = ['Task', 'Deliverable', 'Size', 'Status', 'Due'].map((text) => ({
    text,
    options: { bold: true, fill: { color: 'F2F2F2' } },
  }))

  for (const [assigneeId, tasks] of byAssignee) {
    const name = assigneeId === 'unassigned' ? 'Unassigned' : usersById.get(assigneeId)?.name ?? 'Unknown'
    const slide = pptx.addSlide()
    slide.addText(name, { x: 0.5, y: 0.3, fontSize: 20, bold: true })

    const rows: PptxGenJS.TableRow[] = [
      header,
      ...tasks.map((t) => [
        { text: t.title },
        { text: t.deliverable || '—' },
        { text: t.size },
        { text: STATUS_LABEL[t.status] },
        { text: formatDateOnly(t.dueDate) },
      ]),
    ]

    slide.addTable(rows, {
      x: 0.5,
      y: 1.0,
      w: 12.3,
      colW: [3.5, 5, 1, 1.5, 1.3],
      fontSize: 11,
      border: { type: 'solid', color: 'DDDDDD', pt: 0.5 },
      autoPage: true,
    })
  }
}

export async function exportToPptx(state: AppState, ganttElement: HTMLElement | null): Promise<void> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'SIDETRACK_WIDE', width: 13.33, height: 7.5 })
  pptx.layout = 'SIDETRACK_WIDE'

  addSummarySlide(pptx, state)

  if (ganttElement) {
    try {
      await addGanttSlide(pptx, ganttElement)
    } catch {
      // Capture failed — fall back to a table-only deck rather than risk a corrupt file.
    }
  }

  addTaskSlides(pptx, state)

  const date = new Date().toISOString().slice(0, 10)
  await pptx.writeFile({ fileName: `sidetrack-report-${date}.pptx` })
}
