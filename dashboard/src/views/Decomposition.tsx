import { useLayoutEffect, useRef, useState } from 'react'
import { Panel } from '../components/Panel'
import { DIM_GROUPS, DIM_LIST, DIMS, fmt, MEASURES, measureSelect, type DimKey } from '../lib/model'
import { lit, where } from '../lib/sql'
import { useApp } from '../lib/state'
import { useQuery } from '../lib/useQuery'

interface Step { dim: DimKey; member: string | null }
interface Member extends Record<string, string | number> { col: number; member: string; value: number; sales: number }

const SHOW = 8
const SUGGESTED: DimKey[] = ['store_region', 'store_type', 'family', 'department', 'marital', 'member_card', 'income', 'has_promo']

/** Power-BI-style decomposition tree: split the measure by any axis, pick a member, split again. */
export function Decomposition() {
  const { filters, measure, pick } = useApp()
  const mm = MEASURES[measure]
  const [steps, setSteps] = useState<Step[]>([{ dim: 'store_region', member: null }])
  const box = useRef<HTMLDivElement>(null)
  const [links, setLinks] = useState<string[]>([])

  const total = useQuery(`SELECT ${measureSelect([measure])} FROM sales ${where(filters)}`)
  const baseWhere = where(filters).replace(/^WHERE /, '')

  // one UNION query: column i = members of steps[i].dim within the path chosen in columns 0..i-1
  const sql = steps.map((s, i) => {
    const path = steps.slice(0, i).map((p) => `(${DIMS[p.dim].expr}) = ${lit(p.member!)}`)
    const cond = [baseWhere, ...path].filter(Boolean).join(' AND ')
    return `SELECT ${i} AS col, (${DIMS[s.dim].expr}) AS member, (${MEASURES[measure].sql})::DOUBLE AS value, sum(sales)::DOUBLE AS sales
            FROM sales ${cond ? `WHERE ${cond}` : ''} GROUP BY 2`
  }).join(' UNION ALL ') + ' ORDER BY col, value DESC NULLS LAST'
  const q = useQuery<Member>(sql)
  const byCol = steps.map((_, i) => (q.data ?? []).filter((r) => r.col === i))
  const used = new Set(steps.map((s) => s.dim))

  const choose = (i: number, member: string) => {
    const s = steps.slice(0, i + 1).map((x, j) => (j === i ? { ...x, member: x.member === member ? null : member } : x))
    if (s[i].member != null && s.length === i + 1 && s.length < 6) {
      const next = SUGGESTED.find((d) => !s.some((x) => x.dim === d)) ?? DIM_LIST.find((d) => !s.some((x) => x.dim === d.key))!.key
      s.push({ dim: next, member: null })
    }
    setSteps(s)
  }
  const changeDim = (i: number, dim: DimKey) => setSteps([...steps.slice(0, i), { dim, member: null }])

  // connectors: from the selected node of column i to the head of column i+1
  useLayoutEffect(() => {
    const root = box.current
    if (!root) return
    const r0 = root.getBoundingClientRect()
    const paths: string[] = []
    const anchor = (el: Element | null, side: 'l' | 'r') => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: (side === 'r' ? r.right : r.left) - r0.left + root.scrollLeft, y: r.top + r.height / 2 - r0.top }
    }
    const rootNode = root.querySelector('[data-root]')
    const firstHead = root.querySelector('[data-col="0"] .decomp-node')
    const a0 = anchor(rootNode, 'r'), b0 = anchor(firstHead, 'l')
    if (a0 && b0) paths.push(curve(a0, b0))
    steps.forEach((s, i) => {
      if (s.member == null) return
      const a = anchor(root.querySelector(`[data-col="${i}"] [data-active="true"]`), 'r')
      const b = anchor(root.querySelector(`[data-col="${i + 1}"] .decomp-node`), 'l')
      if (a && b) paths.push(curve(a, b))
    })
    setLinks(paths)
  }, [steps, q.data])

  const t = total.data?.[0]?.[measure] as number | undefined

  return (
    <Panel
      title="Arbre de décomposition"
      sub={<>D'où vient le chiffre ? Choisissez un axe par colonne, cliquez un membre pour découper la suite. {mm.additive ? '' : <>Mesure non additive : les barres comparent les valeurs entre elles.</>}</>}
      actions={
        <>
          <button className="btn" onClick={() => setSteps([{ dim: 'store_region', member: null }])}>Recommencer</button>
          <button
            className="btn btn-accent"
            disabled={!steps.some((s) => s.member)}
            onClick={() => steps.forEach((s) => s.member && pick(s.dim, s.member))}
            title="Applique le chemin choisi comme filtre global"
          >Appliquer comme filtre</button>
        </>
      }
    >
      <div className="decomp" ref={box}>
        <svg className="decomp-svg" width="100%" height="100%">
          {links.map((d, i) => <path key={i} d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeOpacity={0.55} />)}
        </svg>
        <div className="decomp-col">
          <div className="decomp-col-head"><span className="level-tag">Total</span></div>
          <div className="decomp-node decomp-root" data-root>
            <div className="top"><span className="name">{mm.label}</span></div>
            <div className="kpi-value" style={{ fontSize: 22 }}>{fmt(t, mm.format)}</div>
            <span className="share">contexte filtré</span>
          </div>
        </div>
        {steps.map((s, i) => {
          const rows = byCol[i]
          const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9)
          const sum = rows.reduce((a, r) => a + (mm.additive ? r.value : r.sales), 0)
          const visible = rows.slice(0, SHOW)
          if (s.member && !visible.some((r) => r.member === s.member)) {
            const sel = rows.find((r) => r.member === s.member)
            if (sel) visible.push(sel)
          }
          return (
            <div className="decomp-col" key={i} data-col={i}>
              <div className="decomp-col-head">
                <select className="select" value={s.dim} onChange={(e) => changeDim(i, e.target.value as DimKey)} aria-label={`Axe de la colonne ${i + 1}`}>
                  {DIM_GROUPS.map((g) => (
                    <optgroup key={g} label={g}>
                      {DIM_LIST.filter((d) => d.group === g && (d.key === s.dim || !used.has(d.key))).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                    </optgroup>
                  ))}
                </select>
                {i > 0 && <button className="chip-x" aria-label="Supprimer cette colonne" onClick={() => setSteps(steps.slice(0, i).map((x, j) => (j === i - 1 ? { ...x, member: null } : x)))}>×</button>}
              </div>
              {q.loading && !rows.length && <span className="decomp-more">Calcul…</span>}
              {visible.map((r) => (
                <button key={r.member} className="decomp-node" data-active={s.member === r.member} onClick={() => choose(i, r.member)} title={`${DIMS[s.dim].label} : ${r.member}`}>
                  <div className="top"><span className="name">{r.member}</span><span className="num">{fmt(r.value, mm.format)}</span></div>
                  <span className="bar-track"><span className="bar-fill" style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: s.member === r.member ? 'var(--citrus)' : undefined }} /></span>
                  <span className="share">{fmt((mm.additive ? r.value : r.sales) / sum, 'pct')} {mm.additive ? 'du parent' : 'du CA parent'}</span>
                </button>
              ))}
              {rows.length > visible.length && <span className="decomp-more">+ {rows.length - visible.length} autres membres</span>}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function curve(a: { x: number; y: number }, b: { x: number; y: number }) {
  const mx = (a.x + b.x) / 2
  return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`
}
