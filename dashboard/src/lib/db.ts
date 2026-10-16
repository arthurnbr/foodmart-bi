import * as duckdb from '@duckdb/duckdb-wasm'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'

export type Row = Record<string, string | number | boolean | null>

let ready: Promise<duckdb.AsyncDuckDBConnection> | null = null

async function boot(): Promise<duckdb.AsyncDuckDBConnection> {
  // the worker resolves the wasm URL against its own location: hand it absolute URLs
  const abs = (u: string) => new URL(u, location.href).href
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: abs(mvpWasm), mainWorker: abs(mvpWorker) },
    eh: { mainModule: abs(ehWasm), mainWorker: abs(ehWorker) },
  })
  const worker = new Worker(bundle.mainWorker!)
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  const base = import.meta.env.BASE_URL
  await Promise.all(['sales', 'customers'].map(async (name) => {
    const res = await fetch(`${base}data/${name}.parquet`)
    if (!res.ok) throw new Error(`Fichier de données introuvable : data/${name}.parquet (${res.status})`)
    await db.registerFileBuffer(`${name}.parquet`, new Uint8Array(await res.arrayBuffer()))
  }))
  const conn = await db.connect()
  // materialise in DuckDB's columnar memory: every interaction then runs locally in a few ms
  await conn.query(`CREATE TABLE sales AS SELECT * FROM 'sales.parquet'`)
  await conn.query(`CREATE TABLE customers AS SELECT * FROM 'customers.parquet'`)
  return conn
}

export function initDb() {
  ready ??= boot()
  return ready
}

// duckdb-wasm serialises queries per connection; chaining keeps ordering explicit
let chain: Promise<unknown> = Promise.resolve()

export function query<T extends Row = Row>(sql: string): Promise<T[]> {
  const run = chain.then(async () => {
    const conn = await initDb()
    const table = await conn.query(sql)
    const fields = table.schema.fields.map((f) => f.name)
    const out: T[] = []
    for (const r of table) {
      const o: Row = {}
      for (const k of fields) {
        const v = r[k]
        o[k] = typeof v === 'bigint' ? Number(v) : (v as Row[string])
      }
      out.push(o as T)
    }
    return out
  })
  chain = run.catch(() => undefined)
  return run
}
