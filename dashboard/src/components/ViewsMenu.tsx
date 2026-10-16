import { useEffect, useRef, useState } from 'react'
import { DIMS, MEASURES, type DimKey } from '../lib/model'
import { decode, TABS, useApp } from '../lib/state'
import { hashOf, useSavedViews } from '../lib/views'

const PRESET_VIEWS: { name: string; hash: string }[] = [
  { name: 'Marge des mariés en Golden', hash: '#m=margin_rate&f={"marital":["Marié(e)"],"member_card":["Golden"]}' },
  { name: 'T4 · alimentaire par magasin', hash: '#tab=explorer&f={"semester":["S2"],"quarter":["Q4"],"family":["Food"]}' },
  { name: 'Carte de l\'État de Washington', hash: '#tab=map&f={"cust_state":["WA"]}' },
  { name: 'Effet des promotions par média', hash: '#tab=promo&m=units' },
]

function summary(hash: string) {
  const s = decode(hash)
  const parts = (Object.entries(s.filters) as [DimKey, string[]][]).map(([k, vals]) => `${DIMS[k].label} : ${vals.join(', ')}`)
  return [TABS.find((t) => t.key === s.tab)?.label, MEASURES[s.measure].label, ...parts].join(' · ')
}

/** Topbar menu: save the current context under a name, reopen it later (stored in this browser). */
export function ViewsMenu() {
  const app = useApp()
  const { views, save, remove } = useSavedViews()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [justSaved, setJustSaved] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const current = hashOf(app)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc) }
  }, [open])

  const onSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const v = save(name, app)
    setName('')
    setJustSaved(v.id)
  }
  const copyLink = (hash: string) => navigator.clipboard?.writeText(location.origin + location.pathname + hash)

  return (
    <div className="views" ref={box}>
      <button className="search-btn views-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)} data-tour="views">
        <span aria-hidden>★</span><span className="label">Vues</span>{views.length > 0 && <span className="views-count">{views.length}</span>}
      </button>
      {open && (
        <div className="views-pop" role="dialog" aria-label="Vues enregistrées">
          <form className="views-save" onSubmit={onSave}>
            <label htmlFor="view-name">Enregistrer le contexte actuel</label>
            <div className="views-save-row">
              <input id="view-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Marge T4 Washington" maxLength={60} />
              <button className="btn btn-accent" disabled={!name.trim()}>Enregistrer</button>
            </div>
            <small>{summary(current)}</small>
          </form>

          <div className="views-list">
            <div className="views-head">Mes vues</div>
            {views.length === 0 && <p className="views-empty">Aucune vue enregistrée. Filtrez, choisissez une mesure, puis enregistrez : la vue se rouvre en un clic.</p>}
            {views.map((v) => (
              <div key={v.id} className="views-item" data-active={v.hash === current} data-new={v.id === justSaved}>
                <button className="views-open" onClick={() => { app.applyView(decode(v.hash)); setOpen(false) }}>
                  <b>{v.name}</b>
                  <small>{summary(v.hash)}</small>
                </button>
                <button className="chip-x" title="Copier le lien" aria-label={`Copier le lien de ${v.name}`} onClick={() => copyLink(v.hash)}>⧉</button>
                <button className="chip-x" title="Supprimer" aria-label={`Supprimer ${v.name}`} onClick={() => remove(v.id)}>×</button>
              </div>
            ))}
          </div>

          <div className="views-list">
            <div className="views-head">Suggestions</div>
            {PRESET_VIEWS.map((v) => (
              <div key={v.name} className="views-item" data-active={v.hash === current}>
                <button className="views-open" onClick={() => { app.applyView(decode(v.hash)); setOpen(false) }}>
                  <b>{v.name}</b>
                  <small>{summary(v.hash)}</small>
                </button>
              </div>
            ))}
          </div>
          <p className="views-foot">Les vues sont stockées dans ce navigateur. Pour partager, copiez le lien ⧉ : l'URL contient tout le contexte.</p>
        </div>
      )}
    </div>
  )
}
