import { useEffect, useState } from 'react'
import { CommandPalette } from './components/CommandPalette'
import { ContextRail } from './components/ContextRail'
import { initDb } from './lib/db'
import { MEASURE_LIST, type MeasureKey } from './lib/model'
import { StateProvider, TABS, useApp } from './lib/state'
import { Decomposition } from './views/Decomposition'
import { Explorer } from './views/Explorer'
import { MapView } from './views/MapView'
import { Overview } from './views/Overview'
import { Promotions } from './views/Promotions'

function Shell() {
  const { tab, setTab, measure, setMeasure } = useApp()
  const [palette, setPalette] = useState(false)
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Food<em>Mart</em></span>
          <span className="brand-sub">Ventes 2024 · 13 magasins</span>
        </div>
        <nav className="tabs" role="tablist" aria-label="Vues">
          {TABS.map((t) => (
            <button key={t.key} role="tab" className="tab" aria-selected={tab === t.key} title={t.hint} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </nav>
        <div className="topbar-right">
          <select className="measure-select" value={measure} onChange={(e) => setMeasure(e.target.value as MeasureKey)} aria-label="Mesure analysée">
            {MEASURE_LIST.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <button className="search-btn" onClick={() => setPalette(true)}>
            <span aria-hidden>⌕</span><span className="label">Rechercher, filtrer…</span><kbd>Ctrl K</kbd>
          </button>
        </div>
      </header>
      <ContextRail />
      <main>
        {tab === 'overview' && <Overview />}
        {tab === 'map' && <MapView />}
        {tab === 'explorer' && <Explorer />}
        {tab === 'decomp' && <Decomposition />}
        {tab === 'promo' && <Promotions />}
      </main>
      <CommandPalette open={palette} setOpen={setPalette} />
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
      </div>
    )
  }
  return <StateProvider><Shell /></StateProvider>
}
