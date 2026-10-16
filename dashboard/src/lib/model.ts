// Semantic layer: every dimension, measure and hierarchy the UI can use.
// Dimension `expr` always yields VARCHAR so filters are uniform `expr IN (...)`.

export type DimKey =
  | 'semester' | 'quarter' | 'month'
  | 'family' | 'department' | 'category' | 'subcategory' | 'product' | 'brand' | 'low_fat' | 'recyclable' | 'price_band'
  | 'store_region' | 'store_state' | 'store_city' | 'store' | 'store_type' | 'store_age_band'
  | 'cust_country' | 'cust_state' | 'cust_city' | 'customer'
  | 'marital' | 'gender' | 'income' | 'education' | 'occupation' | 'member_card' | 'houseowner'
  | 'total_children' | 'children_home' | 'cars' | 'age_band' | 'account_year'
  | 'has_promo' | 'media_type' | 'promo'

export type DimGroup = 'Temps' | 'Produit' | 'Magasin' | 'Localisation client' | 'Profil client' | 'Promotion'

export interface Dim {
  key: DimKey
  label: string
  group: DimGroup
  expr: string
  /** SQL aggregated to sort members in natural order; default: sort by measure */
  order?: string
  /** true when the column also exists in customers.parquet (penetration base) */
  customerAttr?: boolean
  /** searchable from the command palette */
  searchable?: boolean
}

const caseOrder = (col: string, values: string[]) =>
  `min(CASE ${col} ${values.map((v, i) => `WHEN '${v}' THEN ${i}`).join(' ')} ELSE 99 END)`

export const INCOME_ORDER = ['$10K - $30K', '$30K - $50K', '$50K - $70K', '$70K - $90K', '$90K - $110K', '$110K - $130K', '$130K - $150K', '$150K +']
export const EDUCATION_ORDER = ['Partial High School', 'High School Degree', 'Partial College', 'Bachelors Degree', 'Graduate Degree']
export const CARD_ORDER = ['Normal', 'Bronze', 'Silver', 'Golden']

export const PRICE_BAND_EXPR = `CASE WHEN price < 1 THEN '< 1 $' WHEN price < 2 THEN '1–2 $' WHEN price < 3 THEN '2–3 $' ELSE '≥ 3 $' END`

const dims: Dim[] = [
  { key: 'semester', label: 'Semestre', group: 'Temps', expr: 'semester', order: 'min(semester)' },
  { key: 'quarter', label: 'Trimestre', group: 'Temps', expr: 'quarter', order: 'min(quarter)' },
  { key: 'month', label: 'Mois', group: 'Temps', expr: 'month_name', order: 'min(month)' },

  { key: 'family', label: 'Famille', group: 'Produit', expr: 'family', searchable: true },
  { key: 'department', label: 'Département', group: 'Produit', expr: 'department', searchable: true },
  { key: 'category', label: 'Catégorie', group: 'Produit', expr: 'category', searchable: true },
  { key: 'subcategory', label: 'Sous-catégorie', group: 'Produit', expr: 'subcategory', searchable: true },
  { key: 'product', label: 'Produit', group: 'Produit', expr: 'product_name', searchable: true },
  { key: 'brand', label: 'Marque', group: 'Produit', expr: 'brand', searchable: true },
  { key: 'price_band', label: 'Tranche de prix', group: 'Produit', expr: PRICE_BAND_EXPR, order: 'min(price)' },
  { key: 'low_fat', label: 'Allégé', group: 'Produit', expr: 'low_fat' },
  { key: 'recyclable', label: 'Emballage', group: 'Produit', expr: 'recyclable' },

  { key: 'store_region', label: 'Région commerciale', group: 'Magasin', expr: 'store_region', searchable: true },
  { key: 'store_state', label: 'État (magasin)', group: 'Magasin', expr: 'store_state' },
  { key: 'store_city', label: 'Ville (magasin)', group: 'Magasin', expr: 'store_city', searchable: true },
  { key: 'store', label: 'Magasin', group: 'Magasin', expr: 'store_name', searchable: true },
  { key: 'store_type', label: 'Type de magasin', group: 'Magasin', expr: 'store_type', searchable: true },
  { key: 'store_age_band', label: 'Ancienneté du magasin', group: 'Magasin', expr: 'store_age_band', order: 'min(store_age)' },

  { key: 'cust_country', label: 'Pays (client)', group: 'Localisation client', expr: 'cust_country', customerAttr: true },
  { key: 'cust_state', label: 'État (client)', group: 'Localisation client', expr: 'cust_state', customerAttr: true },
  { key: 'cust_city', label: 'Ville (client)', group: 'Localisation client', expr: 'cust_city', customerAttr: true, searchable: true },
  { key: 'customer', label: 'Client', group: 'Localisation client', expr: 'customer_name', customerAttr: true, searchable: true },

  { key: 'marital', label: 'Statut marital', group: 'Profil client', expr: 'marital', customerAttr: true },
  { key: 'gender', label: 'Genre', group: 'Profil client', expr: 'gender', customerAttr: true },
  { key: 'age_band', label: "Tranche d'âge", group: 'Profil client', expr: 'age_band', order: 'min(age)', customerAttr: true },
  { key: 'income', label: 'Revenu annuel', group: 'Profil client', expr: 'income', order: caseOrder('income', INCOME_ORDER), customerAttr: true },
  { key: 'education', label: 'Éducation', group: 'Profil client', expr: 'education', order: caseOrder('education', EDUCATION_ORDER), customerAttr: true },
  { key: 'occupation', label: 'Profession', group: 'Profil client', expr: 'occupation', customerAttr: true },
  { key: 'member_card', label: 'Carte fidélité', group: 'Profil client', expr: 'member_card', order: caseOrder('member_card', CARD_ORDER), customerAttr: true },
  { key: 'houseowner', label: 'Logement', group: 'Profil client', expr: 'houseowner', customerAttr: true },
  { key: 'total_children', label: 'Enfants', group: 'Profil client', expr: 'total_children::VARCHAR', order: 'min(total_children)', customerAttr: true },
  { key: 'children_home', label: 'Enfants au foyer', group: 'Profil client', expr: 'children_home::VARCHAR', order: 'min(children_home)', customerAttr: true },
  { key: 'cars', label: 'Voitures', group: 'Profil client', expr: 'cars::VARCHAR', order: 'min(cars)', customerAttr: true },
  { key: 'account_year', label: 'Client depuis', group: 'Profil client', expr: 'account_year', order: 'min(account_year)', customerAttr: true },

  { key: 'has_promo', label: 'Promotion', group: 'Promotion', expr: 'has_promo' },
  { key: 'media_type', label: 'Média', group: 'Promotion', expr: 'media_type', searchable: true },
  { key: 'promo', label: 'Campagne', group: 'Promotion', expr: 'promo_name', searchable: true },
]

export const DIMS = Object.fromEntries(dims.map((d) => [d.key, d])) as Record<DimKey, Dim>
export const DIM_LIST = dims
export const DIM_GROUPS: DimGroup[] = ['Temps', 'Produit', 'Magasin', 'Localisation client', 'Profil client', 'Promotion']

export interface Hierarchy { key: string; label: string; levels: DimKey[] }
export const HIERARCHIES: Hierarchy[] = [
  { key: 'time', label: 'Temps', levels: ['semester', 'quarter', 'month'] },
  { key: 'product', label: 'Produit', levels: ['family', 'department', 'category', 'subcategory', 'product'] },
  { key: 'store', label: 'Réseau de magasins', levels: ['store_region', 'store_state', 'store_city', 'store'] },
  { key: 'cust_geo', label: 'Localisation client', levels: ['cust_country', 'cust_state', 'cust_city', 'customer'] },
  { key: 'promo', label: 'Promotion', levels: ['has_promo', 'media_type', 'promo'] },
]
export const hierarchyOf = (k: DimKey) => HIERARCHIES.find((h) => h.levels.includes(k))

export type MeasureKey = 'sales' | 'margin' | 'margin_rate' | 'cost' | 'units' | 'lines' | 'customers' | 'avg_price' | 'per_customer' | 'avg_line'
export type Format = 'money' | 'pct' | 'int' | 'money2'

export interface Measure { key: MeasureKey; label: string; short: string; sql: string; format: Format; additive: boolean; hint: string }

const measures: Measure[] = [
  { key: 'sales', label: "Chiffre d'affaires", short: 'CA', sql: 'sum(sales)', format: 'money', additive: true, hint: 'Σ store_sales' },
  { key: 'margin', label: 'Marge brute', short: 'Marge', sql: 'sum(sales - cost)', format: 'money', additive: true, hint: 'CA − coût' },
  { key: 'margin_rate', label: 'Taux de marge', short: 'Tx marge', sql: 'sum(sales - cost) / nullif(sum(sales), 0)', format: 'pct', additive: false, hint: 'Marge / CA' },
  { key: 'cost', label: 'Coût des ventes', short: 'Coût', sql: 'sum(cost)', format: 'money', additive: true, hint: 'Σ store_cost' },
  { key: 'units', label: 'Unités vendues', short: 'Unités', sql: 'sum(units)', format: 'int', additive: true, hint: 'Σ unit_sales' },
  { key: 'lines', label: "Lignes d'achat", short: 'Lignes', sql: 'sum(lines)', format: 'int', additive: true, hint: 'Σ fact_count (pas de n° de ticket)' },
  { key: 'customers', label: 'Clients actifs', short: 'Clients', sql: 'count(DISTINCT customer_id)', format: 'int', additive: false, hint: 'Clients distincts ayant acheté' },
  { key: 'per_customer', label: 'CA par client', short: 'CA/client', sql: 'sum(sales) / nullif(count(DISTINCT customer_id), 0)', format: 'money2', additive: false, hint: 'CA / clients actifs' },
  { key: 'avg_price', label: 'Prix moyen unitaire', short: 'Prix moy.', sql: 'sum(sales) / nullif(sum(units), 0)', format: 'money2', additive: false, hint: 'CA / unités' },
  { key: 'avg_line', label: "CA moyen par ligne", short: 'CA/ligne', sql: 'sum(sales) / nullif(sum(lines), 0)', format: 'money2', additive: false, hint: "CA / lignes d'achat" },
]
export const MEASURES = Object.fromEntries(measures.map((m) => [m.key, m])) as Record<MeasureKey, Measure>
export const MEASURE_LIST = measures

/** SELECT list fragment `expr::DOUBLE AS key` for the given measures */
export const measureSelect = (keys: MeasureKey[]) => keys.map((k) => `(${MEASURES[k].sql})::DOUBLE AS ${k}`).join(', ')

const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 })
const money2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })

export function fmt(v: number | null | undefined, f: Format): string {
  if (v == null || Number.isNaN(v)) return '—'
  switch (f) {
    case 'money': return money.format(v)
    case 'money2': return money2.format(v)
    case 'int': return int.format(v)
    case 'pct': return pct.format(v)
  }
}
export const fmtM = (v: number | null | undefined, m: MeasureKey) => fmt(v, MEASURES[m].format)
export function fmtCompact(v: number, f: Format): string {
  if (f === 'pct') return pct.format(v)
  const s = compact.format(v)
  return f === 'money' || f === 'money2' ? `${s} $` : s
}
export function fmtDelta(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${pct.format(v)}`
}
