// The export has one year (2024) at month grain: every period is a set of months 1..12.
import type { Filters } from './state'

export const MONTH_NAMES = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.']
export const MONTH_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

const SEMESTER_MONTHS: Record<string, number[]> = { S1: [1, 2, 3, 4, 5, 6], S2: [7, 8, 9, 10, 11, 12] }
const QUARTER_MONTHS: Record<string, number[]> = { Q1: [1, 2, 3], Q2: [4, 5, 6], Q3: [7, 8, 9], Q4: [10, 11, 12] }

export const PRESETS: { key: string; label: string; months: number[] }[] = [
  { key: 'S1', label: 'S1', months: SEMESTER_MONTHS.S1 },
  { key: 'S2', label: 'S2', months: SEMESTER_MONTHS.S2 },
  { key: 'Q1', label: 'T1', months: QUARTER_MONTHS.Q1 },
  { key: 'Q2', label: 'T2', months: QUARTER_MONTHS.Q2 },
  { key: 'Q3', label: 'T3', months: QUARTER_MONTHS.Q3 },
  { key: 'Q4', label: 'T4', months: QUARTER_MONTHS.Q4 },
]

/** Months selected by the semester/quarter/month filters combined (AND), or null when time is unfiltered. */
export function effectiveMonths(filters: Filters): number[] | null {
  let set: number[] | null = null
  const meet = (months: number[]) => { set = set ? set.filter((m) => months.includes(m)) : months }
  if (filters.semester?.length) meet(filters.semester.flatMap((s) => SEMESTER_MONTHS[s] ?? []))
  if (filters.quarter?.length) meet(filters.quarter.flatMap((q) => QUARTER_MONTHS[q] ?? []))
  if (filters.month?.length) meet(filters.month.map((n) => MONTH_NAMES.indexOf(n) + 1).filter((m) => m > 0))
  return set === null ? null : [...new Set<number>(set)].sort((a, b) => a - b)
}

/** Filters with the time axes replaced by an explicit month list (null = whole year). */
export function withMonths(filters: Filters, months: number[] | null): Filters {
  const f: Filters = { ...filters }
  delete f.semester
  delete f.quarter
  delete f.month
  if (months && months.length < 12) f.month = months.map((m) => MONTH_NAMES[m - 1])
  return f
}

export interface Comparison { current: number[]; previous: number[]; label: string }

/**
 * Previous period of equal length right before the selection (contiguous selections only).
 * Whole year: there is no 2023, so the year is compared half against half (S2 vs S1).
 */
export function comparison(filters: Filters): Comparison | null {
  const cur = effectiveMonths(filters)
  if (!cur || cur.length === 12) return { current: SEMESTER_MONTHS.S2, previous: SEMESTER_MONTHS.S1, label: 'S2 vs S1' }
  if (!cur.length) return null
  const contiguous = cur.every((m, i) => i === 0 || m === cur[i - 1] + 1)
  const n = cur.length
  if (!contiguous || cur[0] - n < 1) return null
  const previous = Array.from({ length: n }, (_, i) => cur[0] - n + i)
  return { current: cur, previous, label: `vs ${periodLabel(previous)}` }
}

/** Human label of a month set: "T4", "S1", "mars", "janv.–avr.", "3 mois". */
export function periodLabel(months: number[] | null): string {
  if (!months || months.length === 12) return 'Année 2024'
  const key = (m: number[]) => m.join(',')
  for (const p of PRESETS) if (key(p.months) === key(months)) return p.label
  if (months.length === 1) return MONTH_LONG[months[0] - 1]
  const contiguous = months.every((m, i) => i === 0 || m === months[i - 1] + 1)
  if (contiguous) return `${MONTH_NAMES[months[0] - 1].toLowerCase()}–${MONTH_NAMES[months.at(-1)! - 1].toLowerCase()}`
  return `${months.length} mois`
}
