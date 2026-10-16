import { DIMS, HIERARCHIES, type DimKey } from '../lib/model'
import { useApp } from '../lib/state'

/** Sticky bar showing the full analysis context: one breadcrumb trail per hierarchy, one chip per flat filter. */
export function ContextRail() {
  const { filters, clear, drillUp } = useApp()
  const active = Object.keys(filters) as DimKey[]
  const inHierarchy = new Set<DimKey>()

  const trails = HIERARCHIES.flatMap((h) => {
    const levels = h.levels.filter((l) => filters[l]?.length)
    if (!levels.length) return []
    levels.forEach((l) => inHierarchy.add(l))
    return [(
      <div className="trail" key={h.key} title={`Hiérarchie ${h.label}`}>
        <span className="trail-name">{h.label}</span>
        {levels.map((l, i) => (
          <span key={l} style={{ display: 'contents' }}>
            {i > 0 && <span className="crumb-sep">›</span>}
            <button
              className="crumb"
              title={`${DIMS[l].label} — cliquer pour remonter à ce niveau`}
              onClick={() => drillUp(h, h.levels.indexOf(l) + 1)}
            >
              {filters[l]!.join(', ')}
            </button>
          </span>
        ))}
        <button className="chip-x" aria-label={`Retirer le filtre ${h.label}`} onClick={() => clear(h.levels)}>×</button>
      </div>
    )]
  })

  const chips = active.filter((k) => !inHierarchy.has(k)).map((k) => (
    <div className="chip" key={k}>
      <span>{DIMS[k].label}</span>
      <b>{filters[k]!.join(', ')}</b>
      <button className="chip-x" aria-label={`Retirer le filtre ${DIMS[k].label}`} onClick={() => clear([k])}>×</button>
    </div>
  ))

  return (
    <div className="rail" aria-label="Filtres actifs">
      <span className="rail-label">Contexte</span>
      {active.length === 0
        ? <span className="rail-empty">Toutes les ventes 2024 — cliquez sur n'importe quel élément pour filtrer ou descendre d'un niveau</span>
        : <>{trails}{chips}</>}
      {active.length > 0
        ? <button className="rail-reset" onClick={() => clear()}>Tout effacer</button>
        : <span className="rail-hint"><kbd>Ctrl</kbd> + clic : sélection multiple · <kbd>⌫</kbd> navigateur : annuler</span>}
    </div>
  )
}
