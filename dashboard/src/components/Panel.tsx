import type { ReactNode } from 'react'

export function Panel({ title, sub, actions, loading, error, className = '', children }: {
  title: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  loading?: boolean
  error?: string | null
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <div>
          <h2 className="panel-title">{title}</h2>
          {sub && <div className="panel-sub">{sub}</div>}
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      <div className={`panel-body${loading ? ' panel-loading' : ''}`}>
        {error ? <p className="error">Requête en échec : {error}</p> : children}
      </div>
    </section>
  )
}

export function Seg<T extends string>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}
