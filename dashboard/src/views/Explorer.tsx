import { useEffect, useMemo, useRef, useState } from 'react'
import { Panel } from '../components/Panel'
import { query, type Row } from '../lib/db'
import { DIM_GROUPS, DIM_LIST, DIMS, fmt, HIERARCHIES, MEASURE_LIST, MEASURES, type DimKey, type MeasureKey } from '../lib/model'
import { lit, where } from '../lib/sql'
import { useApp } from '../lib/state'
import { useQuery } from '../lib/useQuery'

/** A row path is the list of members from the top level down to this node. */
type Path = string[]
const keyOf = (p: Path) => p.join('\u0000')

interface Node { path: Path; data: Row }

function DimSelect({ value, onChange, label }: { value: DimKey; onChange: (d: DimKey) => void; label: string }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as DimKey)} aria-label={label}>
      {DIM_GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {DIM_LIST.filter((d) => d.group === g).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

/**
 * Tree-table: rows follow a chosen hierarchy (or any custom chain of dimensions),
 * each node expands lazily into the next level; optional column dimension pivots the measure.
 */
export function Explorer() {
  const { filters, measure, pick } = useApp()
  const [preset, setPreset] = useState<string>('product')
  const [levels, setLevels] = useState<DimKey[]>(HIERARCHIES.find((h) => h.key === 'product')!.levels)
  const [cols, setCols] = useState<DimKey | 'none'>('quarter')
  const [shown, setShown] = useState<MeasureKey[]>(['sales', 'margin', 'margin_rate', 'units', 'customers'])
  const [sort, setSort] = useState<{ col: string; desc: boolean }>({ col: measure, desc: true })

  const pivot = cols !== 'none'
  const colMembers = useQuery<{ m: string }>(pivot
    ? `SELECT (${DIMS[cols].expr}) AS m FROM sales ${where(filters)} GROUP BY 1 ORDER BY ${DIMS[cols].order ?? `sum(sales) DESC`} LIMIT 12`
    : null)
  const colList = useMemo(() => (pivot ? (colMembers.data ?? []).map((r) => r.m) : []), [pivot, colMembers.data])

  // pivot mode: every aggregate of the measure gets `FILTER (WHERE col = member)` (measures only use sum/count on plain columns)
  const valueCols = useMemo(() => {
    if (!pivot) return shown.map((k) => ({ id: k, label: MEASURES[k].short, measure: k, sql: `(${MEASURES[k].sql})::DOUBLE` }))
    const colExpr = DIMS[cols].expr
    return [
      ...colList.map((m, i) => ({
        id: `c${i}`, label: m, measure,
        sql: `(${MEASURES[measure].sql.replace(/\b(sum|count)\(([^()]*)\)/g, `$1($2) FILTER (WHERE (${colExpr}) = ${lit(m)})`)})::DOUBLE`,
      })),
      { id: 'tot', label: 'Total', measure, sql: `(${MEASURES[measure].sql})::DOUBLE` },
    ]
  }, [pivot, colList, measure, cols, shown])

  const selectList = valueCols.map((c) => `${c.sql} AS ${c.id}`).join(', ')
  const orderCol = valueCols.some((c) => c.id === sort.col) ? sort.col : valueCols.at(-1)?.id ?? 'tot'
  const levelSql = (depth: number, path: Path) => {
    const d = DIMS[levels[depth]]
    const pathWhere = path.map((v, i) => `(${DIMS[levels[i]].expr}) = ${lit(v)}`)
    const w = where(filters)
    const cond = [w.replace(/^WHERE /, ''), ...pathWhere].filter(Boolean).join(' AND ')
    return `SELECT (${d.expr}) AS member, ${selectList}${d.order ? `, ${d.order} AS ord` : ''}
      FROM sales ${cond ? `WHERE ${cond}` : ''} GROUP BY 1
      ORDER BY ${sort.col === 'member' ? (d.order ? 'ord' : 'member') : orderCol} ${sort.desc ? 'DESC' : 'ASC'} NULLS LAST LIMIT 500`
  }

  const top = useQuery(levels.length ? levelSql(0, []) : null)
  const total = useQuery(`SELECT ${selectList} FROM sales ${where(filters)}`)

  // subtrees are cached per "structure" (filters, levels, columns, sort): any change drops them,
  // and late answers from a previous structure are ignored
  const structure = JSON.stringify([filters, levels, valueCols.map((c) => c.sql), sort])
  const [cache, setCache] = useState<{ structure: string; rows: Record<string, Row[]> }>({ structure, rows: {} })
  const children = cache.structure === structure ? cache.rows : {}
  const expandKey = JSON.stringify([levels, filters])
  const [expandedState, setExpandedState] = useState<{ key: string; open: Record<string, true> }>({ key: expandKey, open: {} })
  const expanded = expandedState.key === expandKey ? expandedState.open : {}
  const setExpanded = (fn: (s: Record<string, true>) => Record<string, true>) => setExpandedState({ key: expandKey, open: fn(expanded) })
  const [loadingKeys, setLoadingKeys] = useState<Record<string, true>>({})

  // fetch children of expanded nodes not cached yet for the current structure
  const missing = Object.keys(expanded).filter((k) => !children[k] && !loadingKeys[`${structure}|${k}`] && k.split('\u0000').length < levels.length)
  const missingKey = missing.join('\u0001')
  const levelSqlRef = useRef(levelSql)
  levelSqlRef.current = levelSql
  useEffect(() => {
    if (!missingKey) return
    for (const k of missingKey.split('\u0001')) {
      const path = k.split('\u0000')
      const lk = `${structure}|${k}`
      setLoadingKeys((s) => ({ ...s, [lk]: true }))
      query(levelSqlRef.current(path.length, path)).then((rows) => {
        setCache((c) => c.structure === structure ? { structure, rows: { ...c.rows, [k]: rows } } : { structure, rows: { [k]: rows } })
      }).finally(() => setLoadingKeys((s) => { const n = { ...s }; delete n[lk]; return n }))
    }
  }, [missingKey, structure])
  const loadingNode = (k: string) => !!loadingKeys[`${structure}|${k}`]

  const toggle = (p: Path) => setExpanded((s) => {
    const k = keyOf(p)
    const n = { ...s }
    if (n[k]) { for (const x of Object.keys(n)) if (x === k || x.startsWith(k + '\u0000')) delete n[x] }
    else n[k] = true
    return n
  })

  const flat: Node[] = []
  const walk = (rows: Row[] | undefined, parent: Path) => {
    for (const r of rows ?? []) {
      const path = [...parent, String(r.member)]
      flat.push({ path, data: r })
      if (expanded[keyOf(path)]) walk(children[keyOf(path)], path)
    }
  }
  walk(top.data, [])

  // heat scale per column, computed on visible rows of the same depth as the top level
  const colMax = Object.fromEntries(valueCols.map((c) => [c.id, Math.max(...(top.data ?? []).map((r) => Math.abs(Number(r[c.id]) || 0)), 1e-9)]))

  const choosePreset = (k: string) => {
    setPreset(k)
    const h = HIERARCHIES.find((x) => x.key === k)
    if (h) setLevels(h.levels)
  }
  const setLevel = (i: number, d: DimKey) => { setPreset('custom'); setLevels(levels.map((l, j) => (j === i ? d : l))) }

  const exportCsv = () => {
    const header = ['Niveau', ...levels.map((l) => DIMS[l].label), ...valueCols.map((c) => c.label)]
    const lines = flat.map((n) => [DIMS[levels[n.path.length - 1]].label, ...levels.map((_, i) => n.path[i] ?? ''), ...valueCols.map((c) => n.data[c.id] ?? '')])
    const csv = [header, ...lines].map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = 'foodmart-explorateur.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const headSort = (col: string) => setSort((s) => ({ col, desc: s.col === col ? !s.desc : col !== 'member' }))

  return (
    <Panel
      title="Explorateur"
      sub="Déplier ▸ pour descendre d'un niveau · cliquer un libellé pour filtrer tout le tableau de bord · cliquer un en-tête pour trier"
      loading={top.loading || colMembers.loading || Object.keys(loadingKeys).length > 0}
      error={top.error ?? colMembers.error}
      actions={<button className="btn" onClick={exportCsv}>Exporter en CSV</button>}
    >
      <div className="toolbar" style={{ padding: '0 0 12px' }}>
        <label className="field">Lignes
          <select className="select" value={preset} onChange={(e) => choosePreset(e.target.value)}>
            {HIERARCHIES.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
            <option value="custom">Personnalisé</option>
          </select>
        </label>
        {levels.map((l, i) => (
          <span key={i} className="field">
            {i > 0 && '›'}
            <DimSelect value={l} onChange={(d) => setLevel(i, d)} label={`Niveau ${i + 1}`} />
          </span>
        ))}
        {levels.length < 6 && <button className="btn" onClick={() => { setPreset('custom'); setLevels([...levels, 'marital']) }}>+ niveau</button>}
        {levels.length > 1 && <button className="btn" onClick={() => { setPreset('custom'); setLevels(levels.slice(0, -1)) }}>− niveau</button>}
        <label className="field">Colonnes
          <select className="select" value={cols} onChange={(e) => setCols(e.target.value as DimKey | 'none')}>
            <option value="none">Plusieurs mesures</option>
            {DIM_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {DIM_LIST.filter((d) => d.group === g && !['product', 'customer', 'promo', 'cust_city'].includes(d.key)).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        {!pivot && (
          <div className="measure-toggles" role="group" aria-label="Mesures affichées">
            {MEASURE_LIST.map((m) => (
              <button key={m.key} className="toggle" aria-pressed={shown.includes(m.key)}
                onClick={() => setShown(shown.includes(m.key) ? shown.filter((x) => x !== m.key) : MEASURE_LIST.map((x) => x.key).filter((x) => x === m.key || shown.includes(x)))}>
                {m.short}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="pivot-wrap">
        <table className="pivot">
          <thead>
            <tr>
              <th data-sorted={sort.col === 'member'} onClick={() => headSort('member')}>
                {levels.map((l) => DIMS[l].label).join(' › ')} {sort.col === 'member' ? (sort.desc ? '↓' : '↑') : ''}
              </th>
              {valueCols.map((c) => (
                <th key={c.id} data-sorted={orderCol === c.id && sort.col !== 'member'} onClick={() => headSort(c.id)} title={MEASURES[c.measure].label}>
                  {c.label} {orderCol === c.id && sort.col !== 'member' ? (sort.desc ? '↓' : '↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flat.map((n) => {
              const depth = n.path.length - 1
              const dim = levels[depth]
              const leaf = depth >= levels.length - 1
              const k = keyOf(n.path)
              return (
                <tr key={k}>
                  <th style={{ paddingLeft: 8 + depth * 22 }}>
                    <button className="tree-btn" disabled={leaf} aria-expanded={!!expanded[k]} aria-label={expanded[k] ? 'Replier' : 'Déplier'} onClick={() => toggle(n.path)}>
                      {loadingNode(k) ? '…' : expanded[k] ? '▾' : '▸'}
                    </button>
                    <button className="member-link" onClick={(e) => pickPath(n.path, e.ctrlKey || e.metaKey)} title={`Filtrer sur ${n.path.join(' › ')}`}>{String(n.data.member)}</button>
                    {depth === 0 || <span className="depth-tag">{DIMS[dim].label}</span>}
                  </th>
                  {valueCols.map((c) => {
                    const v = Number(n.data[c.id])
                    const heat = depth === 0 && MEASURES[c.measure].additive && c.id !== 'tot' ? Math.min(1, Math.abs(v) / colMax[c.id]) * 0.22 : 0
                    return (
                      <td key={c.id}>
                        <span className="heat" style={{ '--h': heat } as React.CSSProperties} />
                        <span className="num">{n.data[c.id] == null ? '—' : fmt(v, MEASURES[c.measure].format)}</span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {total.data?.[0] && (
              <tr className="total">
                <th>Total ({flat.filter((n) => n.path.length === 1).length} {DIMS[levels[0]].label.toLowerCase()})</th>
                {valueCols.map((c) => <td key={c.id}><span className="num">{fmt(Number(total.data![0][c.id]), MEASURES[c.measure].format)}</span></td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  )

  function pickPath(path: Path, multi: boolean) {
    // fix every ancestor so the global context mirrors the row's position in the tree
    path.forEach((v, i) => { if (i < path.length - 1) pick(levels[i], v) })
    pick(levels[path.length - 1], path.at(-1)!, multi)
  }
}

