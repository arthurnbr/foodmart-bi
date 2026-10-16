import { useEffect, useState } from 'react'
import { breakdownSql, type BreakdownRow } from '../lib/breakdown'
import { DIMS, MEASURES, type DimKey } from '../lib/model'
import { useApp } from '../lib/state'
import { useQuery } from '../lib/useQuery'
import { BarList } from './BarList'

const SECTIONS: { title: string; dims: DimKey[] }[] = [
  { title: 'Qui achète ?', dims: ['marital', 'gender', 'age_band', 'income', 'member_card', 'education', 'occupation', 'total_children', 'houseowner', 'cars', 'account_year'] },
  { title: 'Où ?', dims: ['store_region', 'store_type', 'store_age_band', 'cust_state'] },
  { title: 'Quoi ?', dims: ['family', 'price_band', 'low_fat', 'recyclable', 'has_promo'] },
]

export const DRAWER_DIMS: DimKey[] = SECTIONS.flatMap((s) => s.dims)

function Facet({ dim }: { dim: DimKey }) {
  const { filters, measure } = useApp()
  const q = useQuery<BreakdownRow>(breakdownSql(dim, filters, measure))
  const active = filters[dim]?.length ?? 0
  return (
    <details className="facet" open>
      <summary>
        <span>{DIMS[dim].label}</span>
        {active > 0 && <span className="facet-count">{active}</span>}
      </summary>
      <BarList dim={dim} rows={q.data ?? []} measure={measure} />
    </details>
  )
}

/** Side drawer with every flat analysis axis; available on every page. */
export function FilterDrawer({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { filters, measure, clear } = useApp()
  const [section, setSection] = useState(0)
  const activeInDrawer = DRAWER_DIMS.filter((d) => filters[d]?.length)

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open, setOpen])

  return (
    <>
      <div className="drawer-scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden />
      <aside className="drawer" data-open={open} aria-label="Filtres" aria-hidden={!open} inert={!open}>
        <header className="drawer-head">
          <div>
            <h2 className="panel-title">Filtres</h2>
            <div className="panel-sub">Chaque barre filtre tout le tableau de bord · {MEASURES[measure].label}</div>
          </div>
          <button className="chip-x" aria-label="Fermer les filtres" onClick={() => setOpen(false)}>×</button>
        </header>
        <nav className="seg drawer-tabs" aria-label="Familles de filtres">
          {SECTIONS.map((s, i) => (
            <button key={s.title} aria-pressed={section === i} onClick={() => setSection(i)}>
              {s.title}
              {s.dims.some((d) => filters[d]?.length) && <span className="dot" aria-hidden />}
            </button>
          ))}
        </nav>
        <div className="drawer-body">
          {/* facets only query while the drawer is visible */}
          {open && SECTIONS[section].dims.map((d) => <Facet key={d} dim={d} />)}
        </div>
        <footer className="drawer-foot">
          <span>{activeInDrawer.length ? `${activeInDrawer.length} axe(s) filtré(s)` : 'Aucun filtre ici'}</span>
          {activeInDrawer.length > 0 && <button className="btn" onClick={() => clear(activeInDrawer)}>Effacer</button>}
          <button className="btn btn-accent" onClick={() => setOpen(false)}>Voir les résultats</button>
        </footer>
      </aside>
    </>
  )
}
