import * as echarts from 'echarts'
import { useEffect, useRef } from 'react'

export interface ChartClick { name: string; data: unknown; multi: boolean; seriesName?: string }

const THEME = {
  color: ['#5b2a86', '#1f8a85', '#f2a541', '#e4572e', '#4f9bd9', '#8da34a'],
  textStyle: { fontFamily: 'Instrument Sans Variable, system-ui, sans-serif', color: '#4a4560' },
  tooltip: {
    backgroundColor: '#1b1530', borderWidth: 0, padding: [8, 12],
    textStyle: { color: '#fff', fontSize: 12 }, extraCssText: 'border-radius:10px;box-shadow:0 12px 40px rgb(27 21 48 / .25);',
  },
}
echarts.registerTheme('rayon', THEME)

export function Chart({ option, height = 300, onClick }: {
  option: echarts.EChartsCoreOption
  height?: number | string
  onClick?: (e: ChartClick) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const clickRef = useRef(onClick)
  clickRef.current = onClick

  useEffect(() => {
    const c = echarts.init(el.current!, 'rayon', { renderer: 'canvas' })
    chart.current = c
    c.on('click', (p) => {
      const ev = (p.event?.event ?? {}) as MouseEvent
      clickRef.current?.({ name: p.name, data: p.data, seriesName: p.seriesName, multi: ev.ctrlKey || ev.metaKey || ev.shiftKey })
    })
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(el.current!)
    return () => { ro.disconnect(); c.dispose() }
  }, [])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true })
    if (el.current) el.current.style.cursor = onClick ? 'pointer' : 'default'
  }, [option, onClick])

  return <div ref={el} style={{ width: '100%', height }} />
}
