import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl'
import maplibreWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BarList } from '../components/BarList'
import { Panel, Seg } from '../components/Panel'
import { breakdownSql, type BreakdownRow } from '../lib/breakdown'
import { fmt, fmtCompact, MEASURES, measureSelect, type MeasureKey } from '../lib/model'
import { where } from '../lib/sql'
import { useApp } from '../lib/state'
import { useQuery } from '../lib/useQuery'

interface Geo { states: GeoJSON.FeatureCollection; cities: Record<string, [number, number]> }
let geoPromise: Promise<Geo> | null = null
const loadGeo = () => (geoPromise ??= fetch(`${import.meta.env.BASE_URL}data/geo.json`).then((r) => r.json() as Promise<Geo>))

const STYLE = 'https://tiles.openfreemap.org/styles/positron'
const RAMP = ['#f1ebf7', '#d4c1e6', '#a985cb', '#7b4fa8', '#4a1f72']

maplibregl.setWorkerUrl(new URL(maplibreWorker, location.href).href)

type Layer = 'states' | 'cities' | 'stores'

/** Three analysis grains on one map: customer state (choropleth), customer city (bubbles), store (pins). */
export function MapView() {
  const { filters, measure, pick } = useApp()
  const mm = MEASURES[measure]
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ states: true, cities: true, stores: true })
  const [side, setSide] = useState<'cust_city' | 'store'>('cust_city')
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [geo, setGeo] = useState<Geo | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const pickRef = useRef(pick)
  pickRef.current = pick

  const measures = useMemo<MeasureKey[]>(() => [...new Set<MeasureKey>([measure, 'sales', 'customers', 'margin_rate'])], [measure])
  // geographic filters are excluded from their own layer so the selection stays visible in context
  const statesSql = `SELECT cust_state AS k, ${measureSelect(measures)} FROM sales ${where(filters, ['cust_state', 'cust_city', 'customer'])} GROUP BY 1`
  const citiesSql = `SELECT cust_city || '|' || cust_state AS k, cust_city AS name, ${measureSelect(measures)} FROM sales ${where(filters, ['cust_city', 'customer'])} GROUP BY ALL`
  const storesSql = `SELECT store_city || '|' || store_state AS k, store_name AS name, any_value(store_type) AS type, ${measureSelect(measures)} FROM sales ${where(filters, ['store', 'store_city'])} GROUP BY ALL`
  const states = useQuery(statesSql)
  const cities = useQuery(citiesSql)
  const stores = useQuery(storesSql)
  // customer base (buyers + non-buyers) for penetration rate
  const base = useQuery(`SELECT cust_city || '|' || cust_state AS k, count(*)::DOUBLE AS n FROM customers ${where(filters, ['cust_city', 'customer'], true)} GROUP BY 1`)
  const sideRows = useQuery<BreakdownRow>(breakdownSql(side, filters, measure, side === 'cust_city' ? ['cust_city', 'customer'] : ['store'], 30))

  useEffect(() => { loadGeo().then(setGeo) }, [])

  // ---------------------------------------------------------------- map lifecycle
  useEffect(() => {
    const m = new maplibregl.Map({ container: box.current!, style: STYLE, center: [-118, 41], zoom: 4, attributionControl: { compact: true } })
    map.current = m
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.addControl(new maplibregl.FullscreenControl(), 'top-right')
    m.on('load', () => {
      const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
      for (const id of ['states', 'cities', 'stores']) m.addSource(id, { type: 'geojson', data: empty })
      const firstLabel = m.getStyle().layers.find((l) => l.type === 'symbol')?.id
      m.addLayer({ id: 'states-fill', type: 'fill', source: 'states', paint: { 'fill-color': ['coalesce', ['get', 'color'], '#e6e8ee'], 'fill-opacity': 0.72 } }, firstLabel)
      m.addLayer({ id: 'states-line', type: 'line', source: 'states', paint: { 'line-color': ['case', ['get', 'sel'], '#f2a541', '#ffffff'], 'line-width': ['case', ['get', 'sel'], 3, 1] } }, firstLabel)
      m.addLayer({
        id: 'cities', type: 'circle', source: 'cities',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'r'], 0, 3, 1, 26],
          'circle-color': ['case', ['get', 'sel'], '#f2a541', '#1f8a85'],
          'circle-opacity': ['case', ['get', 'dim'], 0.25, 0.7],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2,
        },
      })
      m.addLayer({
        id: 'stores', type: 'circle', source: 'stores',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'r'], 0, 6, 1, 16],
          'circle-color': ['case', ['get', 'sel'], '#f2a541', '#1b1530'],
          'circle-opacity': ['case', ['get', 'dim'], 0.35, 1],
          'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5,
        },
      })
      m.addLayer({
        id: 'stores-label', type: 'symbol', source: 'stores', minzoom: 5,
        layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, 1.6], 'text-anchor': 'top', 'text-font': ['Noto Sans Bold'] },
        paint: { 'text-color': '#1b1530', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
      })

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, maxWidth: '280px' })
      const hover = (layer: string) => {
        m.on('mousemove', layer, (e) => {
          m.getCanvas().style.cursor = 'pointer'
          const f = e.features![0] as MapGeoJSONFeature
          popup.setLngLat(e.lngLat).setHTML(String(f.properties.tip)).addTo(m)
        })
        m.on('mouseleave', layer, () => { m.getCanvas().style.cursor = ''; popup.remove() })
      }
      ;['stores', 'cities', 'states-fill'].forEach(hover)
      // one click handler, topmost layer wins
      m.on('click', (e) => {
        const multi = e.originalEvent.ctrlKey || e.originalEvent.metaKey || e.originalEvent.shiftKey
        const hit = m.queryRenderedFeatures(e.point, { layers: ['stores', 'cities', 'states-fill'].filter((l) => m.getLayer(l) && m.getLayoutProperty(l, 'visibility') !== 'none') })[0]
        if (!hit) return
        const p = hit.properties
        if (hit.layer.id === 'stores') pickRef.current('store', p.name, multi)
        else if (hit.layer.id === 'cities') pickRef.current('cust_city', p.name, multi)
        else if (p.hasData) pickRef.current('cust_state', p.state, multi)
      })
      setMapReady(true)
    })
    return () => { m.remove(); map.current = null }
  }, [])

  // ---------------------------------------------------------------- data → sources
  const fc = useMemo(() => {
    if (!geo || !states.data || !cities.data || !stores.data) return null
    const baseBy = Object.fromEntries((base.data ?? []).map((r) => [r.k, Number(r.n)]))
    const tip = (title: string, r: Record<string, unknown>, extra = '') =>
      `<div class="map-tip"><b>${title}</b><table>` +
      measures.map((k) => `<tr><td>${MEASURES[k].label}</td><td>${fmt(Number(r[k]), MEASURES[k].format)}</td></tr>`).join('') +
      extra + '</table></div>'

    const sv = Object.fromEntries(states.data.map((r) => [r.k, r]))
    const values = states.data.map((r) => Number(r[measure]))
    const lo = Math.min(...values), hi = Math.max(...values)
    const selStates = filters.cust_state ?? []
    const stateFc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: geo.states.features.map((f) => {
        const st = String(f.properties!.state)
        const r = sv[st]
        const t = r ? (hi > lo ? (Number(r[measure]) - lo) / (hi - lo) : 1) : null
        return {
          ...f,
          properties: {
            ...f.properties, hasData: !!r, sel: selStates.includes(st),
            color: t == null ? null : RAMP[Math.min(RAMP.length - 1, Math.floor(t * RAMP.length))],
            tip: r ? tip(`${f.properties!.name} (${st})`, r) : `<div class="map-tip"><b>${f.properties!.name}</b>Aucune vente : pas de magasin dans cet état</div>`,
          },
        }
      }),
    }

    const cmax = Math.max(...cities.data.map((r) => Math.abs(Number(r[measure]))), 1e-9)
    const selCities = filters.cust_city ?? []
    const cityFc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: cities.data.filter((r) => geo.cities[String(r.k)]).map((r) => {
        const n = baseBy[String(r.k)]
        const pen = n ? Number(r.customers) / n : null
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: geo.cities[String(r.k)] },
          properties: {
            name: r.name, r: Math.sqrt(Math.abs(Number(r[measure])) / cmax),
            sel: selCities.includes(String(r.name)), dim: selCities.length > 0 && !selCities.includes(String(r.name)),
            tip: tip(`${r.name} · clients`, r, `<tr><td>Pénétration</td><td>${fmt(pen, 'pct')}</td></tr>`),
          },
        }
      }),
    }

    const smax = Math.max(...stores.data.map((r) => Math.abs(Number(r[measure]))), 1e-9)
    const selStores = filters.store ?? []
    const storeFc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: stores.data.map((r) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: geo.cities[String(r.k)] },
        properties: {
          name: r.name, label: `${String(r.name).split(' · ')[1]} · ${fmtCompact(Number(r[measure]), mm.format)}`,
          r: Math.sqrt(Math.abs(Number(r[measure])) / smax),
          sel: selStores.includes(String(r.name)), dim: selStores.length > 0 && !selStores.includes(String(r.name)),
          tip: tip(`${r.name}`, r, `<tr><td>Type</td><td>${r.type}</td></tr>`),
        },
      })),
    }
    return { states: stateFc, cities: cityFc, stores: storeFc, lo, hi }
  }, [geo, states.data, cities.data, stores.data, base.data, measure, measures, filters, mm])

  useEffect(() => {
    const m = map.current
    if (!m || !mapReady || !fc) return
    ;(m.getSource('states') as GeoJSONSource).setData(fc.states)
    ;(m.getSource('cities') as GeoJSONSource).setData(fc.cities)
    ;(m.getSource('stores') as GeoJSONSource).setData(fc.stores)
  }, [fc, mapReady])

  useEffect(() => {
    const m = map.current
    if (!m || !mapReady) return
    const vis = (on: boolean) => (on ? 'visible' : 'none')
    m.setLayoutProperty('states-fill', 'visibility', vis(layers.states))
    m.setLayoutProperty('states-line', 'visibility', vis(layers.states))
    m.setLayoutProperty('cities', 'visibility', vis(layers.cities))
    m.setLayoutProperty('stores', 'visibility', vis(layers.stores))
    m.setLayoutProperty('stores-label', 'visibility', vis(layers.stores))
  }, [layers, mapReady])

  const fitData = () => {
    // selected points first (they stay drawn because geo layers ignore their own filter); otherwise every non-dimmed point
    const feats = [...(fc?.cities.features ?? []), ...(fc?.stores.features ?? [])]
    const selStates = filters.cust_state ?? []
    const inState = selStates.length
      ? (fc?.states.features ?? []).filter((f) => selStates.includes(String(f.properties?.state)))
      : []
    const chosen = feats.filter((f) => f.properties?.sel)
    const pool = chosen.length ? chosen : feats.filter((f) => !f.properties?.dim)
    const pts = pool.map((f) => (f.geometry as GeoJSON.Point).coordinates as [number, number])
    for (const f of inState) {
      const g = f.geometry
      const rings = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : []
      for (const ring of rings) for (const p of ring) pts.push([p[0], p[1]])
    }
    if (!pts.length || !map.current) return
    const b = pts.reduce((acc, p) => acc.extend(p), new maplibregl.LngLatBounds(pts[0], pts[0]))
    map.current.fitBounds(b, { padding: 60, duration: 800, maxZoom: 9 })
  }
  // zoom to the data whenever the geographic context changes, once every layer reflects the new filters
  const geoKey = JSON.stringify([filters.cust_state, filters.cust_city, filters.store, filters.store_city, filters.store_region, filters.store_state])
  const fresh = states.sql === statesSql && cities.sql === citiesSql && stores.sql === storesSql && fc != null
  const fitRef = useRef(fitData)
  fitRef.current = fitData
  const fitted = useRef<string | null>(null)
  useEffect(() => {
    if (!mapReady || !fresh || fitted.current === geoKey) return
    fitted.current = geoKey
    fitRef.current()
  }, [geoKey, mapReady, fresh])

  const loading = states.loading || cities.loading || stores.loading
  return (
    <div className="map-layout">
      <div className="map-box">
        <div ref={box} style={{ position: 'absolute', inset: 0 }} />
        <div className="map-controls">
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: 13 }}>{mm.label}</strong>
          {(['states', 'cities', 'stores'] as Layer[]).map((l) => (
            <label key={l}>
              <input type="checkbox" checked={layers[l]} onChange={(e) => setLayers({ ...layers, [l]: e.target.checked })} />
              {l === 'states' ? 'États des clients (aplat)' : l === 'cities' ? 'Villes des clients (bulles)' : 'Magasins (points)'}
            </label>
          ))}
          {fc && layers.states && (
            <div className="map-legend">
              <div className="legend-ramp" style={{ background: `linear-gradient(90deg, ${RAMP.join(',')})` }} />
              <div className="legend-scale num"><span>{fmtCompact(fc.lo, mm.format)}</span><span>{fmtCompact(fc.hi, mm.format)}</span></div>
            </div>
          )}
          <button className="btn" onClick={fitData}>Recadrer sur les ventes</button>
          <span style={{ color: 'var(--muted)' }}>Clic : filtrer · Ctrl + clic : ajouter{loading ? ' · calcul…' : ''}</span>
        </div>
      </div>
      <div className="map-side">
        <Panel
          title={side === 'cust_city' ? 'Villes des clients' : 'Magasins'}
          sub="Top 30 — cliquer pour filtrer"
          loading={sideRows.loading}
          error={sideRows.error}
          actions={<Seg label="Liste" value={side} onChange={setSide} options={[{ value: 'cust_city', label: 'Villes' }, { value: 'store', label: 'Magasins' }]} />}
        >
          <BarList dim={side} rows={sideRows.data ?? []} measure={measure} />
        </Panel>
      </div>
    </div>
  )
}
