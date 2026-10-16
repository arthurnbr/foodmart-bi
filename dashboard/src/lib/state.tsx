import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { DIMS, hierarchyOf, MEASURES, type DimKey, type Hierarchy, type MeasureKey } from './model'

export type Filters = Partial<Record<DimKey, string[]>>
export type Tab = 'overview' | 'map' | 'explorer' | 'decomp' | 'promo' | 'method'
export const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'overview', label: "Vue d'ensemble", hint: 'Indicateurs, tendance, produits, profils' },
  { key: 'map', label: 'Carte', hint: 'Clients et magasins sur la carte' },
  { key: 'explorer', label: 'Explorateur', hint: 'Tableau croisé avec drill-down' },
  { key: 'decomp', label: 'Décomposition', hint: "Arbre : d'où vient le chiffre ?" },
  { key: 'promo', label: 'Promotions', hint: 'Médias, campagnes, rentabilité' },
  { key: 'method', label: 'Méthodologie', hint: 'Comment ce reporting a été construit' },
]

export interface State { filters: Filters; measure: MeasureKey; tab: Tab }

type Action =
  | { type: 'set'; dim: DimKey; values: string[] }
  | { type: 'drill'; dim: DimKey; value: string; release: DimKey[] }
  | { type: 'clear'; dims?: DimKey[] }
  | { type: 'filters'; filters: Filters }
  | { type: 'measure'; measure: MeasureKey }
  | { type: 'tab'; tab: Tab }
  | { type: 'replace'; state: State }

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'set': {
      const filters = { ...s.filters }
      if (a.values.length) filters[a.dim] = a.values
      else delete filters[a.dim]
      return { ...s, filters }
    }
    case 'drill': {
      // one action = one history entry: pin this level, release the deeper ones
      const filters = { ...s.filters }
      for (const d of a.release) delete filters[d]
      filters[a.dim] = [a.value]
      return { ...s, filters }
    }
    case 'filters': return { ...s, filters: a.filters }
    case 'clear': {
      if (!a.dims) return { ...s, filters: {} }
      const filters = { ...s.filters }
      for (const d of a.dims) delete filters[d]
      return { ...s, filters }
    }
    case 'measure': return { ...s, measure: a.measure }
    case 'tab': return { ...s, tab: a.tab }
    case 'replace': return a.state
  }
}

// ---------------------------------------------------------------- URL (shareable, back button = undo)
const DEFAULT: State = { filters: {}, measure: 'sales', tab: 'overview' }

export function decode(hash: string): State {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const tab = p.get('tab') as Tab | null
  const m = p.get('m') as MeasureKey | null
  let filters: Filters = {}
  try {
    const raw = JSON.parse(p.get('f') ?? '{}') as Record<string, unknown>
    filters = Object.fromEntries(Object.entries(raw).filter(([k, v]) => k in DIMS && Array.isArray(v) && v.length)) as Filters
  } catch { /* malformed link: start clean */ }
  return {
    tab: TABS.some((t) => t.key === tab) ? tab! : DEFAULT.tab,
    measure: m && m in MEASURES ? m : DEFAULT.measure,
    filters,
  }
}

export function encode(s: State): string {
  const p = new URLSearchParams()
  if (s.tab !== DEFAULT.tab) p.set('tab', s.tab)
  if (s.measure !== DEFAULT.measure) p.set('m', s.measure)
  if (Object.keys(s.filters).length) p.set('f', JSON.stringify(s.filters))
  const str = p.toString()
  return str ? `#${str}` : location.pathname
}

// ---------------------------------------------------------------- context
interface Api extends State {
  setFilter: (dim: DimKey, values: string[]) => void
  replaceFilters: (f: Filters) => void
  clear: (dims?: DimKey[]) => void
  setMeasure: (m: MeasureKey) => void
  setTab: (t: Tab) => void
  /** Restore a saved view; `keepTab` keeps the current page */
  applyView: (s: State, keepTab?: boolean) => void
  /** Click semantics shared by every visual: drill on hierarchy levels, Ctrl/⌘/Shift = multi-select */
  pick: (dim: DimKey, value: string, multi?: boolean) => void
  drillUp: (h: Hierarchy, depth: number) => void
}

const Ctx = createContext<Api | null>(null)

export function StateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => decode(location.hash))

  useEffect(() => {
    const target = encode(state)
    const current = location.hash || location.pathname
    if (target !== current) history.pushState(null, '', target)
  }, [state])

  useEffect(() => {
    const onPop = () => dispatch({ type: 'replace', state: decode(location.hash) })
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const pick = useCallback((dim: DimKey, value: string, multi = false) => {
    const current = state.filters[dim] ?? []
    if (multi) {
      dispatch({ type: 'set', dim, values: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] })
      return
    }
    const h = hierarchyOf(dim)
    const idx = h ? h.levels.indexOf(dim) : -1
    if (h && idx < h.levels.length - 1) {
      dispatch({ type: 'drill', dim, value, release: h.levels.slice(idx + 1) })
      return
    }
    dispatch({ type: 'set', dim, values: current.length === 1 && current[0] === value ? [] : [value] })
  }, [state.filters])

  const api = useMemo<Api>(() => ({
    ...state,
    setFilter: (dim, values) => dispatch({ type: 'set', dim, values }),
    replaceFilters: (filters) => dispatch({ type: 'filters', filters }),
    clear: (dims) => dispatch({ type: 'clear', dims }),
    setMeasure: (measure) => dispatch({ type: 'measure', measure }),
    setTab: (tab) => dispatch({ type: 'tab', tab }),
    applyView: (v, keepTab) => dispatch({ type: 'replace', state: { ...v, tab: keepTab ? state.tab : v.tab } }),
    pick,
    drillUp: (h, depth) => dispatch({ type: 'clear', dims: h.levels.slice(depth) }),
  }), [state, pick])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

export function useApp(): Api {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside StateProvider')
  return v
}

/** Number of leading hierarchy levels pinned to exactly one member (= current drill depth). */
export function drillDepth(filters: Filters, h: Hierarchy): number {
  let d = 0
  for (const l of h.levels.slice(0, -1)) {
    if (filters[l]?.length === 1) d++
    else break
  }
  return d
}
