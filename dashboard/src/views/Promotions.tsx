import { useMemo } from 'react'
import { Chart } from '../components/Chart'
import { Panel } from '../components/Panel'
import { fmt, fmtCompact, MEASURES, measureSelect } from '../lib/model'
import { where } from '../lib/sql'
import { useApp } from '../lib/state'
import { useQuery } from '../lib/useQuery'

const PROMO_DIMS = ['has_promo', 'media_type', 'promo'] as const

export function Promotions() {
  const { filters, measure, pick } = useApp()
  const mm = MEASURES[measure]
  const w = where(filters, [...PROMO_DIMS])

  const split = useQuery(`SELECT has_promo AS k, ${measureSelect(['sales', 'units', 'lines', 'avg_line', 'margin_rate'])} FROM sales ${w} GROUP BY 1 ORDER BY 1`)
  const mediaWhere = where(filters, ['has_promo', 'media_type', 'promo'])
  const media = useQuery(`
    SELECT media_type AS media, ${measureSelect([measure, 'sales'])}
    FROM sales ${mediaWhere ? `${mediaWhere} AND` : 'WHERE'} promotion_id <> 0
    GROUP BY 1 ORDER BY 2 DESC`)
  // campaign = promotion_id (names repeat across districts); cost is per campaign, sales are summed in the filtered context
  const promoWhere = where(filters, ['has_promo', 'promo'])
  const campaigns = useQuery(`
    SELECT promo_name AS name, promotion_id AS id, any_value(media_type) AS media, ${measureSelect(['sales', 'margin', 'units'])},
           any_value(promo_cost)::DOUBLE AS cost
    FROM sales ${promoWhere ? `${promoWhere} AND` : 'WHERE'} promotion_id <> 0
    GROUP BY promotion_id, promo_name ORDER BY sales DESC`)

  const s = split.data ?? []
  const withP = s.find((r) => r.k === 'Avec promotion'), without = s.find((r) => r.k === 'Sans promotion')

  const mediaOption = useMemo(() => {
    const rows = [...(media.data ?? [])].reverse()
    const sel = filters.media_type ?? []
    return {
      grid: { left: 8, right: 60, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => fmt(v, mm.format) },
      xAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtCompact(v, mm.format) }, splitLine: { lineStyle: { color: '#eef0f5' } } },
      yAxis: { type: 'category', data: rows.map((r) => r.media), axisTick: { show: false }, axisLine: { show: false } },
      series: [{
        type: 'bar', barMaxWidth: 18,
        data: rows.map((r) => ({ value: Number(r[measure]), itemStyle: { color: !sel.length || sel.includes(String(r.media)) ? '#1f8a85' : '#cfe3e2', borderRadius: [0, 6, 6, 0] } })),
        label: { show: true, position: 'right', formatter: (p: { value: number }) => fmtCompact(p.value, mm.format), fontSize: 11 },
      }],
    }
  }, [media.data, filters.media_type, mm, measure])

  const roiOption = useMemo(() => {
    const rows = campaigns.data ?? []
    const sel = filters.promo ?? []
    const medias = [...new Set(rows.map((r) => String(r.media)))]
    return {
      grid: { left: 8, right: 24, top: 56, bottom: 28, containLabel: true },
      legend: { top: 0, type: 'scroll', icon: 'circle', itemWidth: 8 },
      tooltip: {
        formatter: (p: { value: number[]; seriesName: string; name: string }) =>
          `<b>${p.name}</b><br/>${p.seriesName}<br/>CA : ${fmt(p.value[1], 'money')}<br/>Coût campagne : ${fmt(p.value[0], 'money')}<br/>CA / coût : ${fmt(p.value[1] / p.value[0], 'pct')}`,
      },
      xAxis: { type: 'log', name: 'Coût de la campagne ($)', nameLocation: 'middle', nameGap: 28, axisLabel: { formatter: (v: number) => fmtCompact(v, 'money') }, splitLine: { lineStyle: { color: '#eef0f5' } } },
      yAxis: { type: 'value', name: 'CA généré', nameLocation: 'middle', nameGap: 48, axisLabel: { formatter: (v: number) => fmtCompact(v, 'money') }, splitLine: { lineStyle: { color: '#eef0f5' } } },
      series: medias.map((m) => ({
        name: m, type: 'scatter',
        data: rows.filter((r) => r.media === m).map((r) => ({
          name: r.name, value: [Number(r.cost), Number(r.sales)],
          symbolSize: Math.max(5, Math.sqrt(Number(r.units)) * 0.7),
          itemStyle: { opacity: !sel.length || sel.includes(String(r.name)) ? 0.7 : 0.12, borderColor: '#fff', borderWidth: 0.5 },
        })),
      })),
    }
  }, [campaigns.data, filters.promo])

  const lift = withP && without ? Number(withP.avg_line) / Number(without.avg_line) - 1 : null
  return (
    <>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {[
          { label: 'CA sous promotion', value: fmt(Number(withP?.sales), 'money'), meta: withP && without ? `${fmt(Number(withP.sales) / (Number(withP.sales) + Number(without.sales)), 'pct')} du CA` : '' },
          { label: 'CA hors promotion', value: fmt(Number(without?.sales), 'money'), meta: '' },
          { label: 'CA moyen par ligne, avec promo', value: fmt(Number(withP?.avg_line), 'money2'), meta: lift == null ? '' : `${lift >= 0 ? '+' : ''}${fmt(lift, 'pct')} vs sans promo` },
          { label: 'Taux de marge, avec promo', value: fmt(Number(withP?.margin_rate), 'pct'), meta: without ? `${fmt(Number(without.margin_rate), 'pct')} sans promo` : '' },
        ].map((k) => (
          <button key={k.label} className="kpi" onClick={() => pick('has_promo', k.label.includes('hors') ? 'Sans promotion' : 'Avec promotion')}>
            <span className="kpi-label">{k.label}</span>
            <span className="kpi-value">{k.value}</span>
            <span className="kpi-meta">{k.meta}</span>
          </button>
        ))}
      </div>
      <div className="grid">
        <div className="span-5">
          <Panel title={`${mm.label} par média`} sub="Ventes sous promotion · cliquer pour filtrer" loading={media.loading} error={media.error}>
            <Chart height={420} option={mediaOption} onClick={(e) => pick('media_type', e.name, e.multi)} />
          </Panel>
        </div>
        <div className="span-7">
          <Panel title="Rentabilité des campagnes" sub="Chaque point est une campagne : coût (échelle log) vs CA généré, taille = unités · cliquer pour filtrer" loading={campaigns.loading} error={campaigns.error}>
            <Chart height={420} option={roiOption} onClick={(e) => pick('promo', e.name, e.multi)} />
          </Panel>
        </div>
      </div>
      <p className="panel-sub" style={{ margin: 0 }}>
        Les prix de vente sont toujours égaux au prix catalogue : une promotion ne se traduit pas par une remise mais par du volume. Le coût d'une campagne couvre tout son district, alors que le CA ne compte que les ventes de cet export : le ratio CA / coût sert à comparer les campagnes entre elles, pas à mesurer un ROI absolu.
      </p>
    </>
  )
}
