import { Command } from 'cmdk'
import { useEffect, useState } from 'react'
import { DIM_LIST, DIMS, MEASURE_LIST, type DimKey } from '../lib/model'
import { TABS, useApp } from '../lib/state'
import { useQuery } from '../lib/useQuery'

interface Member extends Record<string, string> { dim: DimKey; value: string }

const SEARCHABLE = DIM_LIST.filter((d) => d.searchable)
// every searchable member, loaded once (≈ 9 000 values: customers dominate)
const MEMBERS_SQL = SEARCHABLE.map((d) => `SELECT DISTINCT '${d.key}' AS dim, (${d.expr}) AS value FROM sales`).join(' UNION ALL ')

export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { pick, setTab, setMeasure, clear } = useApp()
  const [search, setSearch] = useState('')
  const { data } = useQuery<Member>(open ? MEMBERS_SQL : null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !(e.target instanceof HTMLInputElement))) {
        e.preventDefault()
        setOpen(!open)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null
  const run = (fn: () => void) => { fn(); setOpen(false); setSearch('') }
  const q = search.trim().toLowerCase()
  // cmdk filters itself, but 9 000 nodes is too many to render: pre-filter and cap
  const members = q.length < 2 ? [] : (data ?? []).filter((m) => m.value.toLowerCase().includes(q)).slice(0, 60)
  const tabs = TABS.filter((t) => !q || t.label.toLowerCase().includes(q) || t.hint.toLowerCase().includes(q))
  const measures = MEASURE_LIST.filter((m) => !q || m.label.toLowerCase().includes(q))

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <Command label="Rechercher" shouldFilter={false} loop>
        <Command.Input autoFocus value={search} onValueChange={setSearch} placeholder="Produit, marque, ville, client, campagne… ou une action" />
        <Command.List>
          <Command.Empty>{q.length < 2 ? 'Tapez au moins 2 lettres' : `Aucun résultat pour « ${search} »`}</Command.Empty>
          {members.length > 0 && (
            <Command.Group heading="Filtrer sur">
              {members.map((m) => (
                <Command.Item key={`${m.dim}|${m.value}`} value={`${m.dim}|${m.value}`} onSelect={() => run(() => pick(m.dim, m.value))}>
                  {m.value}<span className="dim">{DIMS[m.dim].label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {tabs.length > 0 && (
            <Command.Group heading="Aller à">
              {tabs.map((t) => (
                <Command.Item key={t.key} value={`tab-${t.key}`} onSelect={() => run(() => setTab(t.key))}>
                  {t.label}<span className="dim">{t.hint}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {measures.length > 0 && (
            <Command.Group heading="Mesure analysée">
              {measures.map((m) => (
                <Command.Item key={m.key} value={`m-${m.key}`} onSelect={() => run(() => setMeasure(m.key))}>
                  {m.label}<span className="dim">{m.hint}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {(!q || 'effacer filtres'.includes(q)) && (
            <Command.Group heading="Actions">
              <Command.Item value="clear" onSelect={() => run(() => clear())}>Effacer tous les filtres</Command.Item>
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  )
}
