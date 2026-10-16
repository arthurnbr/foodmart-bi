import { useEffect, useLayoutEffect, useState } from 'react'
import { useApp } from '../lib/state'

const SEEN_KEY = 'foodmart.onboarding.v1'

interface Step { target: string | null; title: string; body: string }

const STEPS: Step[] = [
  {
    target: null,
    title: 'Bienvenue dans le reporting FoodMart',
    body: "86 805 ventes de 2024, 13 magasins, 5 581 clients. Tout se calcule dans votre navigateur : chaque clic relance l'analyse instantanément. 1 minute pour faire le tour ?",
  },
  { target: '[data-tour="period"]', title: 'Choisir la période', body: 'Glissez sur les mois pour sélectionner une plage, ou cliquez sur S1, T3… Les indicateurs se comparent alors automatiquement à la période précédente.' },
  { target: '[data-tour="kpis"]', title: 'Cliquer partout pour filtrer', body: "Une carte d'indicateur change la mesure analysée dans tous les graphiques. Un clic sur une barre, une case ou un mois filtre tout le tableau de bord. Ctrl + clic pour en sélectionner plusieurs." },
  { target: '[data-tour="rail"]', title: 'Descendre et remonter', body: 'Sur les hiérarchies (Famille › Département › Catégorie…), un clic descend d\'un niveau. Ce fil d\'Ariane montre le contexte : cliquez un maillon pour remonter, × pour retirer.' },
  { target: '[data-tour="filters"]', title: 'Filtres sur toutes les pages', body: 'Statut marital, revenu, carte fidélité, type de magasin… ouvrez le panneau pour filtrer depuis n\'importe quelle page.' },
  { target: '[data-tour="views"]', title: 'Enregistrer ses vues', body: 'Gardez un contexte (filtres + mesure + page) sous un nom et rouvrez-le en un clic. Le lien de la page le partage aussi tel quel.' },
  { target: '[data-tour="tabs"]', title: 'Cinq angles + la méthode', body: 'Carte, Explorateur (tableau croisé), Décomposition (d\'où vient le chiffre ?), Promotions. La page Méthodologie explique comment et avec quoi ce reporting a été construit.' },
]

export function Onboarding({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { setTab } = useApp()
  const [i, setI] = useState(0)
  const [box, setBox] = useState<DOMRect | null>(null)
  const step = STEPS[i]

  const finish = () => { localStorage.setItem(SEEN_KEY, '1'); setOpen(false); setI(0) }
  const next = () => (i < STEPS.length - 1 ? setI(i + 1) : finish())

  useLayoutEffect(() => {
    if (!open || !step.target) { setBox(null); return }
    const el = document.querySelector(step.target)
    if (!el) { setBox(null); return }
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const update = () => setBox(el.getBoundingClientRect())
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [open, step.target])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!open) return null

  // card next to the highlighted element, kept inside the viewport
  const pad = 10
  const cardW = Math.min(360, window.innerWidth - 24)
  const style: React.CSSProperties = box
    ? {
        width: cardW,
        left: Math.min(Math.max(12, box.left), window.innerWidth - cardW - 12),
        top: box.bottom + 16 + 220 < window.innerHeight ? box.bottom + 16 : Math.max(12, box.top - 16 - 220),
      }
    : { width: Math.min(460, window.innerWidth - 24), left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {box
        ? <div className="tour-hole" style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />
        : <div className="tour-scrim" />}
      <div className="tour-card" style={style}>
        <div className="tour-step">{i + 1} / {STEPS.length}</div>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="btn" onClick={finish}>{i === 0 ? 'Passer' : 'Fermer'}</button>
          {i > 0 && <button className="btn" onClick={() => setI(i - 1)}>Précédent</button>}
          {i === STEPS.length - 1 && <button className="btn" onClick={() => { finish(); setTab('method') }}>Lire la méthodologie</button>}
          <button className="btn btn-accent" autoFocus onClick={next}>{i === 0 ? 'Commencer la visite' : i === STEPS.length - 1 ? 'Explorer' : 'Suivant'}</button>
        </div>
      </div>
    </div>
  )
}

export const shouldShowOnboarding = () => !localStorage.getItem(SEEN_KEY)
