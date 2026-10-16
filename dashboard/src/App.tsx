import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CommandPalette } from './components/CommandPalette'
import { ContextRail } from './components/ContextRail'
import { DRAWER_DIMS, FilterDrawer } from './components/FilterDrawer'
import { Onboarding, shouldShowOnboarding } from './components/Onboarding'
import { PeriodBar } from './components/PeriodBar'
import { ViewsMenu } from './components/ViewsMenu'
import { initDb } from './lib/db'
import { MEASURE_LIST, type MeasureKey } from './lib/model'
import { StateProvider, TABS, useApp } from './lib/state'
import { Decomposition } from './views/Decomposition'
import { Explorer } from './views/Explorer'
import { MapView } from './views/MapView'
import { Methodology } from './views/Methodology'
import { Overview } from './views/Overview'
import { Promotions } from './views/Promotions'

function Shell() {
  const { tab, setTab, measure, setMeasure, filters } = useApp()
  const [palette, setPalette] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [tour, setTour] = useState(shouldShowOnboarding)
  const drawerCount = DRAWER_DIMS.filter((d) => filters[d]?.length).length
  const analytic = tab !== 'method'
  // the map fills the viewport below header + context bar: expose their live height as a CSS variable
  const chrome = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = chrome.current
    if (!el) return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--header-h', `${el.getBoundingClientRect().height}px`))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="app" data-tab={tab}>
      <div className="chrome" ref={chrome}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Food<em>Mart</em></span>
          <span className="brand-sub">Ventes 2024 · 13 magasins</span>
        </div>
        <nav className="tabs" role="tablist" aria-label="Vues" data-tour="tabs">
          {TABS.map((t) => (
            <button key={t.key} role="tab" className={`tab${t.key === 'method' ? ' tab-method' : ''}`} aria-selected={tab === t.key} title={t.hint} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </nav>
        <div className="topbar-right">
          {analytic && (
            <>
              <button className="search-btn filters-btn" onClick={() => setDrawer(true)} aria-expanded={drawer} data-tour="filters">
                <span aria-hidden>⧩</span><span className="label">Filtres</span>{drawerCount > 0 && <span className="views-count">{drawerCount}</span>}
              </button>
              <ViewsMenu />
              <select className="measure-select" value={measure} onChange={(e) => setMeasure(e.target.value as MeasureKey)} aria-label="Mesure analysée">
                {MEASURE_LIST.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </>
          )}
          <button className="search-btn" onClick={() => setPalette(true)}>
            <span aria-hidden>⌕</span><span className="label">Rechercher…</span><kbd>Ctrl K</kbd>
          </button>
          <button className="help-btn" onClick={() => setTour(true)} aria-label="Revoir la visite guidée" title="Visite guidée">?</button>
        </div>
      </header>
        {analytic && (
          <div className="context" data-tour="rail">
            <div data-tour="period"><PeriodBar /></div>
            <ContextRail />
          </div>
        )}
      </div>
      <main>
        {tab === 'overview' && <Overview />}
        {tab === 'map' && <MapView />}
        {tab === 'explorer' && <Explorer />}
        {tab === 'decomp' && <Decomposition />}
        {tab === 'promo' && <Promotions />}
        {tab === 'method' && <Methodology />}
      </main>
      <FilterDrawer open={drawer} setOpen={setDrawer} />
      <CommandPalette open={palette} setOpen={setPalette} />
      <Onboarding open={tour && analytic} setOpen={setTour} />
    </div>
  )
}

export default function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | string>('loading')
  useEffect(() => {
    initDb().then(() => setStatus('ready'), (e: unknown) => setStatus(e instanceof Error ? e.message : String(e)))
  }, [])
  if (status !== 'ready') {
    return (
      <div className="boot">
        <h1>Food<span style={{ color: 'var(--citrus)' }}>Mart</span></h1>
        <p>{status === 'loading' ? 'Chargement du moteur analytique et des 86 805 ventes…' : `Chargement impossible : ${status}`}</p>
        {status === 'loading' && <div className="boot-bar" aria-hidden><span /></div>}
      </div>
    )
  }
  return <StateProvider><Shell /></StateProvider>
}
