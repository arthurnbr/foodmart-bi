import { DIMS, type DimKey } from './model'
import type { Filters } from './state'

export const lit = (s: string) => `'${s.replaceAll("'", "''")}'`

/**
 * WHERE clause for the active filters. `except` drops filters on the visual's own
 * dimension(s) so a chart highlights its selection instead of collapsing to it.
 * `onlyCustomer` keeps customer attributes only (for queries on the customers table).
 */
export function where(filters: Filters, except: DimKey[] = [], onlyCustomer = false): string {
  const parts: string[] = []
  for (const [k, values] of Object.entries(filters) as [DimKey, string[]][]) {
    if (!values?.length || except.includes(k)) continue
    const d = DIMS[k]
    if (onlyCustomer && !d.customerAttr) continue
    parts.push(`(${d.expr}) IN (${values.map(lit).join(', ')})`)
  }
  return parts.length ? `WHERE ${parts.join(' AND ')}` : ''
}
