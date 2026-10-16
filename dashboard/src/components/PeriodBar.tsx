import { useRef, useState } from 'react'
import { MONTH_NAMES, PRESETS, effectiveMonths, periodLabel, withMonths } from '../lib/time'
import { fmt, measureSelect, MEASURES } from '../lib/model'
import { where } from '../lib/sql'
import { useApp } from '../lib/state'
import { useQuery } from '../lib/useQuery'

/**
 * Global time brush: 12 month cells sized by the active measure. Drag to select a range,
 * Ctrl+click to toggle single months, presets for semesters/quarters.
 */
export function PeriodBar() {
  const { filters, measure, replaceFilters } = useApp()
  const months = effectiveMonths(filters)
  const q = useQuery(`SELECT month, ${measureSelect([measure])} FROM sales ${where(filters, ['semester', 'quarter', 'month'])} GROUP BY 1 ORDER BY 1`)
  const values = Object.fromEntries((q.data ?? []).map((r) => [Number(r.month), Number(r[measure])]))
  const max = Math.max(...Object.values(values).map(Math.abs), 1e-9)
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null)
  const dragging = useRef(false)

  const apply = (m: number[] | null) => replaceFilters(withMonths(filters, m))
  const range = (a: number, b: number) => Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i)
  const shown = drag ? range(drag.from, drag.to) : months

  return (
    <div className="period" role="group" aria-label="Période">
      <span className="rail-label">Période</span>
      <div className="period-presets">
        <button className="toggle" aria-pressed={!months} onClick={() => apply(null)}>2024</button>
        {PRESETS.map((p) => (
          <button key={p.key} className="toggle" aria-pressed={periodLabel(months) === p.label} onClick={() => apply(p.months)}>{p.label}</button>
        ))}
      </div>
      <div
        className="period-months"
        onMouseLeave={() => { if (dragging.current) { dragging.current = false; if (drag) apply(range(drag.from, drag.to)); setDrag(null) } }}
      >
        {MONTH_NAMES.map((name, i) => {
          const m = i + 1
          const on = !!shown && shown.includes(m)
          return (
            <button
              key={m}
              className="period-cell"
              data-on={on}
              title={`${name} 2024 — ${fmt(values[m], MEASURES[measure].format)} · glisser pour une plage, Ctrl + clic pour ajouter`}
              onMouseDown={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey) {
                  const cur = months ?? []
                  const next = cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m].sort((a, b) => a - b)
                  apply(next.length ? next : null)
                  return
                }
                dragging.current = true
                setDrag({ from: m, to: m })
              }}
              onMouseEnter={() => { if (dragging.current) setDrag((d) => (d ? { ...d, to: m } : d)) }}
              onMouseUp={() => {
                if (!dragging.current || !drag) return
                dragging.current = false
                const sel = range(drag.from, m)
                setDrag(null)
                // re-clicking the only selected month clears the period
                apply(sel.length === 1 && months?.length === 1 && months[0] === sel[0] ? null : sel)
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply([m]) } }}
            >
              <span className="period-bar" style={{ height: `${Math.max(8, (Math.abs(values[m] ?? 0) / max) * 100)}%` }} />
              <span className="period-name">{name}</span>
            </button>
          )
        })}
      </div>
      <span className="period-label">{periodLabel(shown)}</span>
    </div>
  )
}
