import { DIMS, MEASURES, measureSelect, type DimKey, type MeasureKey } from './model'
import { where } from './sql'
import type { Filters } from './state'

export interface BreakdownRow extends Record<string, string | number | null> { member: string; value: number; share: number; sales: number }

/**
 * Members of `dim` with the active measure, the CA and the member's share
 * (share of the measure when additive, share of CA otherwise).
 * Filters on `except` are ignored so the visual keeps showing siblings of the selection.
 */
export function breakdownSql(dim: DimKey, filters: Filters, measure: MeasureKey, except: DimKey[] = [dim], limit?: number): string {
  const d = DIMS[dim]
  const shareOf = MEASURES[measure].additive ? measure : 'sales'
  return `
    WITH b AS (
      SELECT (${d.expr}) AS member, ${measureSelect([measure])}, sum(sales)::DOUBLE AS sales, ${d.order ?? `0`} AS ord
      FROM sales ${where(filters, except)}
      GROUP BY 1
    )
    SELECT member, ${measure} AS value, sales, ${shareOf} / nullif(sum(${shareOf}) OVER (), 0) AS share
    FROM b ORDER BY ${d.order ? 'ord' : `${measure} DESC NULLS LAST`}, member
    ${limit ? `LIMIT ${limit}` : ''}`
}
