import type { BreakdownRow } from '../lib/breakdown'
import { fmt, MEASURES, type DimKey, type MeasureKey } from '../lib/model'
import { useApp } from '../lib/state'

/** Horizontal bars that act as a filter: click = select, Ctrl/⌘ + click = multi-select. */
export function BarList({ dim, rows, measure }: { dim: DimKey; rows: BreakdownRow[]; measure: MeasureKey }) {
  const { filters, pick } = useApp()
  const selected = filters[dim] ?? []
  const max = Math.max(...rows.map((r) => Math.abs(r.value ?? 0)), 0)
  const f = MEASURES[measure].format
  if (!rows.length) return <p className="empty">Aucune vente pour ce contexte</p>
  return (
    <div className="bars">
      {rows.map((r) => (
        <button
          key={r.member}
          className="bar-row"
          data-selected={selected.includes(r.member)}
          data-dim={selected.length > 0 && !selected.includes(r.member)}
          onClick={(e) => pick(dim, r.member, e.ctrlKey || e.metaKey || e.shiftKey)}
          title={`${r.member} — ${fmt(r.value, f)}`}
        >
          <span className="bar-label">{r.member}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${max ? (Math.abs(r.value) / max) * 100 : 0}%` }} /></span>
          <span className="bar-value num">
            {fmt(r.value, f)}
            <small>{fmt(r.share, 'pct')}</small>
          </span>
        </button>
      ))}
    </div>
  )
}
