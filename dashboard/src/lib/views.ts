// Saved views: named snapshots of (filters, measure, page) persisted in localStorage.
// The URL hash is the canonical encoding, so a view is also a shareable link.
import { useCallback, useSyncExternalStore } from 'react'
import { encode, type State } from './state'

export interface SavedView { id: string; name: string; hash: string; createdAt: number }

const KEY = 'foodmart.views.v1'
const listeners = new Set<() => void>()
let cache: SavedView[] | null = null

function read(): SavedView[] {
  if (cache) return cache
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    cache = Array.isArray(raw)
      ? raw.filter((v): v is SavedView => !!v && typeof v === 'object' && 'id' in v && 'name' in v && 'hash' in v)
      : []
  } catch {
    cache = []
  }
  return cache
}

function write(views: SavedView[]) {
  cache = views
  localStorage.setItem(KEY, JSON.stringify(views))
  listeners.forEach((l) => l())
}

// keep tabs in sync when another window saves a view
window.addEventListener('storage', (e) => { if (e.key === KEY) { cache = null; listeners.forEach((l) => l()) } })

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l) }

/** Hash of a state; the default view encodes to the bare path, normalised to '' */
export const hashOf = (s: State) => { const h = encode(s); return h.startsWith('#') ? h : '' }

export function useSavedViews() {
  const views = useSyncExternalStore(subscribe, read)
  const save = useCallback((name: string, s: State) => {
    const v: SavedView = { id: crypto.randomUUID(), name: name.trim(), hash: hashOf(s), createdAt: Date.now() }
    write([v, ...read()])
    return v
  }, [])
  const remove = useCallback((id: string) => write(read().filter((v) => v.id !== id)), [])
  return { views, save, remove }
}
