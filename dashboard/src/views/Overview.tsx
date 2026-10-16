import { useMemo, useState } from 'react'
import { BarList } from '../components/BarList'
import { Chart } from '../components/Chart'
import { Panel, Seg } from '../components/Panel'
import { breakdownSql, type BreakdownRow } from '../lib/breakdown'
import { DIMS, fmt, fmtCompact, fmtDelta, HIERARCHIES, MEASURES, measureSelect, type DimKey, type MeasureKey } from '../lib/model'
import { where } from '../lib/sql'
import { drillDepth, useApp } from '../lib/state'
import { comparison, effectiveMonths, MONTH_NAMES, periodLabel, withMonths } from '../lib/time'
import { useQuery } from '../lib/useQuery'

const KPI_MEASURES: MeasureKey[] = ['sales', 'margin', 'margin_rate', 'units', 'customers', 'per_customer']

// ------------------------------------------------------------------ KPI strip
const TIME_DIMS: DimKey[] = ['semester', 'quarter', 'month']

function Kpis() {
  const { filters, measure, setMeasure } = useApp()
  const cmp = comparison(filters)
  const noTime = where(filters, TIME_DIMS)
  const monthIn = (ms: number[]) => `month IN (${ms.join(',')})`
  const and = (cond: string) => (noTime ? `${noTime} AND ${cond}` : `WHERE ${cond}`)
  const totals = useQuery(`SELECT ${measureSelect(KPI_MEASURES)} FROM sales ${where(filters)}`)
  // comparison: same measures over the current and the previous period (all non-time filters kept)
  const compare = useQuery(cmp
    ? `SELECT ${monthIn(cmp.current)} AS cur, ${measureSelect(KPI_MEASURES)} FROM sales ${and(monthIn([...cmp.current, ...cmp.previous]))} GROUP BY 1`
    : null)
  const monthly = useQuery(`SELECT month, ${measureSelect(KPI_MEASURES)} FROM sales ${noTime} GROUP BY month ORDER BY month`)
  const t = totals.data?.[0]
  const m = monthly.data ?? []
  const cur = compare.data?.find((r) => r.cur === true)
  const prev = compare.data?.find((r) => r.cur === false)
  const sel = effectiveMonths(filters)
  return (
    <div className="kpis" data-tour="kpis">
      {KPI_MEASURES.map((k) => {
        const series = m.map((r) => Number(r[k]))
        const delta = cur && prev && Number(prev[k]) ? (Number(cur[k]) - Number(prev[k])) / Math.abs(Number(prev[k])) : null
        return (
          <button key={k} className="kpi" aria-pressed={measure === k} onClick={() => setMeasure(k)} title={`${MEASURES[k].hint} — cliquer pour analyser cette mesure partout`}>
            <span className="kpi-label">{MEASURES[k].label}</span>
            <span className="kpi-value">{t ? fmt(Number(t[k]), MEASURES[k].format) : '…'}</span>
            <span className="kpi-meta" title={cmp ? `${periodLabel(cmp.current)} comparé à ${periodLabel(cmp.previous)}, mêmes filtres` : 'Pas de période précédente comparable'}>
              <span>{cmp ? cmp.label : 'Pas de période précédente'}</span>
              <span className={delta == null ? '' : delta >= 0 ? 'delta-up' : 'delta-down'}>{fmtDelta(delta)}</span>
            </span>
            <div className="kpi-spark">
              <Chart
                height={38}
                option={{
                  animation: false,
                  grid: { left: 0, right: 0, top: 4, bottom: 0 },
                  xAxis: { type: 'category', show: false, data: m.map((r) => r.month) },
                  yAxis: { type: 'value', show: false, scale: true },
                  series: [{
                    type: 'line', data: series, symbol: 'none', smooth: 0.3,
                    lineStyle: { width: 1.6, color: measure === k ? '#5b2a86' : '#a9a4bd' },
                    areaStyle: { color: measure === k ? 'rgba(91,42,134,.12)' : 'rgba(169,164,189,.12)' },
                    // shade the selected period on the sparkline
                    markArea: sel ? {
                      silent: true, itemStyle: { color: 'rgba(242,165,65,.22)' },
                      data: contiguousRuns(sel).map(([a, b]) => [{ xAxis: String(a) }, { xAxis: String(b) }]),
                    } : undefined,
                  }],
                }}
              />
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** [[1,3],[7,7]] for months [1,2,3,7] — markArea needs contiguous runs */
function contiguousRuns(months: number[]): [number, number][] {
  const runs: [number, number][] = []
  for (const m of months) {
    const last = runs.at(-1)
    if (last && m === last[1] + 1) last[1] = m
    else runs.push([m, m])
  }
  return runs
}

// ------------------------------------------------------------------ monthly trend
function Trend() {
  const { filters, measure, replaceFilters } = useApp()
  const [split, setSplit] = useState<DimKey | 'none'>('none')
  const mm = MEASURES[measure]
  const sql = split === 'none'
    ? `SELECT month, month_name, quarter, ${measureSelect([measure])}, NULL AS s FROM sales ${where(filters, TIME_DIMS)} GROUP BY ALL ORDER BY month`
    : `SELECT month, month_name, quarter, ${measureSelect([measure])}, (${DIMS[split].expr}) AS s FROM sales ${where(filters, TIME_DIMS)} GROUP BY ALL ORDER BY month`
  const q = useQuery(sql)
  const rows = useMemo(() => q.data ?? [], [q.data])
  const months = useMemo(() => [...new Map(rows.map((r) => [r.month as number, r.month_name as string])).entries()].sort((a, b) => a[0] - b[0]), [rows])
  const selKey = effectiveMonths(filters)?.join(',') ?? ''
  const sel = useMemo(() => (selKey ? selKey.split(',').map(Number) : null), [selKey])

  const option = useMemo(() => {
    const groups = [...new Set(rows.map((r) => String(r.s)))]
    const series = groups.map((g) => ({
      name: split === 'none' ? mm.label : g,
      type: split === 'none' ? 'bar' : 'line',
      stack: split !== 'none' && mm.additive ? 'total' : undefined,
      areaStyle: split !== 'none' && mm.additive ? { opacity: 0.18 } : undefined,
      smooth: 0.25, symbolSize: 6, barMaxWidth: 38,
      data: months.map(([n]) => {
        const r = rows.find((x) => x.month === n && String(x.s) === g)
        const on = !sel || sel.includes(n)
        return { value: r ? Number(r[measure]) : 0, itemStyle: split === 'none' ? { color: on ? '#5b2a86' : '#d9d3e6', borderRadius: [6, 6, 0, 0] } : undefined }
      }),
    }))
    return {
      grid: { left: 8, right: 16, top: split === 'none' ? 16 : 40, bottom: 24, containLabel: true },
      legend: split === 'none' ? undefined : { top: 0, type: 'scroll', icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => fmt(v, mm.format) },
      xAxis: { type: 'category', data: months.map((m) => m[1]), axisTick: { show: false }, axisLine: { lineStyle: { color: '#c9ccd8' } } },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtCompact(v, mm.format) }, splitLine: { lineStyle: { color: '#eef0f5' } } },
      series,
    }
  }, [rows, months, split, mm, measure, sel])

  return (
    <Panel
      title={`${mm.label} par mois`}
      sub="Cliquer un mois pour filtrer · Ctrl + clic pour en ajouter"
      loading={q.loading}
      error={q.error}
      actions={
        <>
          <select className="select" value={split} onChange={(e) => setSplit(e.target.value as DimKey | 'none')} aria-label="Découper la courbe par">
            <option value="none">Sans découpage</option>
            {(['family', 'store_type', 'store_state', 'marital', 'gender', 'member_card', 'has_promo', 'age_band'] as DimKey[]).map((k) => (
              <option key={k} value={k}>Par {DIMS[k].label.toLowerCase()}</option>
            ))}
          </select>
        </>
      }
    >
      <Chart height={300} option={option} onClick={(e) => {
        const m = MONTH_NAMES.indexOf(e.name) + 1
        if (m < 1) return
        const cur = sel ?? []
        // click = this month only (re-click clears); Ctrl + click toggles it within the selection
        const next = e.multi
          ? (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m].sort((a, b) => a - b))
          : (cur.length === 1 && cur[0] === m ? [] : [m])
        replaceFilters(withMonths(filters, next.length ? next : null))
      }} />
    </Panel>
  )
}

// ------------------------------------------------------------------ product drill (treemap / sunburst)
function ProductDrill() {
  const { filters, measure, pick, drillUp } = useApp()
  const [view, setView] = useState<'treemap' | 'bars'>('treemap')
  const h = HIERARCHIES.find((x) => x.key === 'product')!
  const depth = drillDepth(filters, h)
  const level = h.levels[Math.min(depth, h.levels.length - 1)]
  const next = h.levels[Math.min(depth + 1, h.levels.length - 1)]
  const mm = MEASURES[measure]
  // show current level and the next one nested, so the treemap reveals what's under each tile
  const nested = level !== 'product'
  const sql = `
    SELECT (${DIMS[level].expr}) AS a, ${nested ? `(${DIMS[next].expr})` : `''`} AS b, ${measureSelect([measure])}, sum(sales)::DOUBLE AS sales
    FROM sales ${where(filters, h.levels.slice(depth))} GROUP BY ALL`
  const q = useQuery(sql)
  const bars = useQuery<BreakdownRow>(view === 'bars' ? breakdownSql(level, filters, measure, h.levels.slice(depth), 25) : null)
  const rows = useMemo(() => q.data ?? [], [q.data])
  const sel = filters[level]

  const option = useMemo(() => {
    const byA = new Map<string, { name: string; value: number; children: { name: string; value: number }[] }>()
    for (const r of rows) {
      const a = String(r.a)
      const node = byA.get(a) ?? { name: a, value: 0, children: [] }
      const v = Number(mm.additive ? r[measure] : r.sales)
      node.value += v
      if (nested) node.children.push({ name: String(r.b), value: v })
      byA.set(a, node)
    }
    const data = [...byA.values()].sort((x, y) => y.value - x.value).slice(0, level === 'product' ? 60 : undefined).map((n) => ({
      ...n,
      children: nested ? n.children : undefined,
      itemStyle: sel?.length && !sel.includes(n.name) ? { opacity: 0.35 } : undefined,
    }))
    return {
      tooltip: {
        formatter: (p: { name: string; value: number; treePathInfo: { name: string }[] }) => {
          const path = p.treePathInfo.slice(1).map((x) => x.name).join(' › ')
          return `<b>${path}</b><br/>${mm.additive ? mm.label : "Chiffre d'affaires"} : ${fmt(p.value, mm.additive ? mm.format : 'money')}`
        },
      },
      series: [{
        type: 'treemap', data, roam: false, nodeClick: false, breadcrumb: { show: false },
        width: '100%', height: '100%', top: 0, left: 0, squareRatio: 1.2,
        upperLabel: { show: nested, height: 22, color: '#fff', fontWeight: 600, fontFamily: 'Bricolage Grotesque Variable' },
        label: { show: true, formatter: (p: { name: string; value: number }) => `${p.name}\n${fmtCompact(p.value, mm.additive ? mm.format : 'money')}`, fontSize: 11, lineHeight: 14 },
        levels: [
          { itemStyle: { borderColor: '#fff', borderWidth: 3, gapWidth: 3 }, colorSaturation: [0.35, 0.6] },
          { itemStyle: { borderColor: 'rgba(255,255,255,.6)', borderWidth: 1, gapWidth: 1 }, colorSaturation: [0.3, 0.55], colorMappingBy: 'value' },
        ],
      }],
    }
  }, [rows, nested, level, mm, measure, sel])

  return (
    <Panel
      title="Produits"
      sub={<>Niveau : <b>{DIMS[level].label}</b>{level !== 'product' && <> · cliquer une case pour descendre en {DIMS[next].label.toLowerCase()}</>}{!mm.additive && view === 'treemap' && <> · surfaces = CA</>}</>}
      loading={q.loading || bars.loading}
      error={q.error ?? bars.error}
      actions={<Seg label="Type de visuel" value={view} onChange={setView} options={[{ value: 'treemap', label: 'Treemap' }, { value: 'bars', label: 'Classement' }]} />}
    >
      <nav className="crumbs" aria-label="Fil d'Ariane produit" style={{ padding: '0 0 8px' }}>
        <button onClick={() => drillUp(h, 0)}>Tous les produits</button>
        {h.levels.slice(0, depth).map((l, i) => (
          <span key={l} style={{ display: 'contents' }}>
            <span className="sep">›</span>
            {i === depth - 1 ? <span className="here">{filters[l]![0]}</span> : <button onClick={() => drillUp(h, i + 1)}>{filters[l]![0]}</button>}
          </span>
        ))}
      </nav>
      {view === 'treemap'
        ? <Chart height={360} option={option} onClick={(e) => {
            // a click on a nested child tile drills two levels at once
            const parent = rows.find((r) => String(r.b) === e.name && nested)
            if (parent && !rows.some((r) => String(r.a) === e.name)) {
              pick(level, String(parent.a))
              pick(next, e.name)
            } else pick(level, e.name, e.multi)
          }} />
        : <div style={{ maxHeight: 380, overflow: 'auto' }}><BarList dim={level} rows={bars.data ?? []} measure={measure} /></div>}
    </Panel>
  )
}

// ------------------------------------------------------------------ store network
function Stores() {
  const { filters, measure } = useApp()
  const [dim, setDim] = useState<DimKey>('store')
  const q = useQuery<BreakdownRow>(breakdownSql(dim, filters, measure))
  return (
    <Panel
      title="Réseau de magasins"
      sub="Cliquer pour filtrer"
      loading={q.loading}
      error={q.error}
      actions={<Seg label="Axe magasin" value={dim} onChange={setDim} options={[{ value: 'store', label: 'Magasin' }, { value: 'store_type', label: 'Type' }, { value: 'store_region', label: 'Région' }]} />}
    >
      <BarList dim={dim} rows={q.data ?? []} measure={measure} />
    </Panel>
  )
}

// ------------------------------------------------------------------ customer profile small multiples
const PROFILE_DIMS: DimKey[] = ['marital', 'gender', 'age_band', 'income', 'member_card', 'education', 'occupation', 'total_children', 'houseowner', 'cars']

function ProfileCard({ dim }: { dim: DimKey }) {
  const { filters, measure } = useApp()
  const q = useQuery<BreakdownRow>(breakdownSql(dim, filters, measure))
  return (
    <Panel title={DIMS[dim].label} loading={q.loading} error={q.error}>
      <BarList dim={dim} rows={q.data ?? []} measure={measure} />
    </Panel>
  )
}

function Profiles() {
  const { measure } = useApp()
  return (
    <section>
      <header className="panel-head" style={{ padding: '8px 0' }}>
        <div>
          <h2 className="panel-title" style={{ fontSize: 20 }}>Qui achète ?</h2>
          <div className="panel-sub">{MEASURES[measure].label} par profil client — chaque barre est un filtre, tous les visuels se recalculent. Ces filtres sont aussi dans le bouton « Filtres » de la barre du haut, sur toutes les pages.</div>
        </div>
      </header>
      <div className="profiles">{PROFILE_DIMS.map((d) => <ProfileCard key={d} dim={d} />)}</div>
    </section>
  )
}

export function Overview() {
  return (
    <>
      <Kpis />
      <div className="grid">
        <div className="span-7"><Trend /></div>
        <div className="span-5"><Stores /></div>
        <div className="span-12"><ProductDrill /></div>
      </div>
      <Profiles />
    </>
  )
}
