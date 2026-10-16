import { useEffect, useRef, useState } from 'react'
import { query, type Row } from './db'

export interface QueryState<T> {
  data: T[] | undefined
  loading: boolean
  error: string | null
  /** SQL that produced `data`: lets callers tell fresh results from the previous ones still on screen */
  sql: string | null
}

/** Runs `sql` whenever it changes; keeps the previous result while the next one loads (no flicker). */
export function useQuery<T extends Row = Row>(sql: string | null): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({ data: undefined, loading: sql != null, error: null, sql: null })
  const seq = useRef(0)

  useEffect(() => {
    if (sql == null) return
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true }))
    query<T>(sql).then(
      (data) => { if (id === seq.current) setState({ data, loading: false, error: null, sql }) },
      (e: unknown) => { if (id === seq.current) setState((s) => ({ ...s, loading: false, error: String(e instanceof Error ? e.message : e) })) },
    )
  }, [sql])

  return state
}
