"""Build the analytical star (flattened) consumed by the dashboard.

Input : the raw CSV export in the parent folder.
Output: dashboard/public/data/{sales.parquet, customers.parquet, geo.json}

Run:  python prep/build.py   (needs duckdb, shapely; geocodes once via Nominatim, cached in prep/geocode.json)
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

import duckdb
from shapely.geometry import mapping, shape

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dashboard" / "public" / "data"
CACHE = ROOT / "prep" / "geocode.json"
NE_ADMIN1 = ROOT / "prep" / "ne_10m_admin1.geojson"  # Natural Earth 10m admin-1, downloaded once (40 MB, not needed at runtime)
NE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"

OUT.mkdir(parents=True, exist_ok=True)
con = duckdb.connect()


def csv(name: str) -> str:
    return f"read_csv_auto('{ROOT / (name + '.csv')}', header=true)"


# ---------------------------------------------------------------- cleaning views
con.execute(f"""
CREATE VIEW region AS
SELECT region_id,
       sales_city, sales_state_province,
       CASE WHEN sales_district = 'Marida' THEN 'Merida' ELSE sales_district END AS sales_district,
       sales_region, sales_country
FROM {csv('region')} WHERE region_id <> 0
""")

con.execute(f"""
CREATE VIEW customer AS
SELECT c.customer_id,
       trim(coalesce(c.fname, '') || ' ' || coalesce(c.lname, '')) AS customer_name,
       c.city AS cust_city,
       -- 'Mexico' (state of México) is wrong for Mexico City customers: the region says DF
       CASE WHEN c.city = 'Mexico City' AND c.state_province = 'Mexico' THEN 'DF' ELSE c.state_province END AS cust_state,
       c.country AS cust_country,
       r.sales_region AS cust_region,
       CASE c.marital_status WHEN 'M' THEN 'Marié(e)' ELSE 'Célibataire' END AS marital,
       CASE c.gender WHEN 'M' THEN 'Homme' ELSE 'Femme' END AS gender,
       c.yearly_income AS income,
       c.education, c.occupation, c.member_card,
       CASE c.houseowner WHEN 'Y' THEN 'Propriétaire' ELSE 'Locataire' END AS houseowner,
       c.total_children::INT AS total_children,
       c.num_children_at_home::INT AS children_home,
       c.num_cars_owned::INT AS cars,
       date_diff('year', c.birthdate::DATE, DATE '2024-12-31') AS age,
       CASE
         WHEN date_diff('year', c.birthdate::DATE, DATE '2024-12-31') < 30 THEN '18–29'
         WHEN date_diff('year', c.birthdate::DATE, DATE '2024-12-31') < 40 THEN '30–39'
         WHEN date_diff('year', c.birthdate::DATE, DATE '2024-12-31') < 50 THEN '40–49'
         WHEN date_diff('year', c.birthdate::DATE, DATE '2024-12-31') < 60 THEN '50–59'
         WHEN date_diff('year', c.birthdate::DATE, DATE '2024-12-31') < 70 THEN '60–69'
         ELSE '70+' END AS age_band,
       year(c.date_accnt_opened::DATE)::VARCHAR AS account_year
FROM {csv('customer')} c
JOIN region r ON r.region_id = c.customer_region_id
""")

con.execute(f"""
CREATE VIEW store AS
SELECT s.store_id,
       s.store_name || ' · ' || s.store_city AS store_name,
       s.store_type, s.store_city, s.store_state, s.store_country,
       r.sales_district AS store_district,
       r.sales_region AS store_region,
       s.store_sqft::DOUBLE AS store_sqft,
       s.coffee_bar::BOOL AS coffee_bar, s.video_store::BOOL AS video_store,
       s.salad_bar::BOOL AS salad_bar, s.prepared_food::BOOL AS prepared_food,
       s.florist::BOOL AS florist,
       -- store age at the end of 2024 (all selling stores opened 1951-1981)
       CASE
         WHEN 2024 - year(s.first_opened_date::DATE) < 45 THEN '< 45 ans'
         WHEN 2024 - year(s.first_opened_date::DATE) < 55 THEN '45–54 ans'
         WHEN 2024 - year(s.first_opened_date::DATE) < 65 THEN '55–64 ans'
         ELSE '65 ans et +' END AS store_age_band,
       2024 - year(s.first_opened_date::DATE) AS store_age
FROM {csv('store')} s
JOIN region r ON r.region_id = s.region_id   -- sales_region_id is inconsistent: not used
WHERE s.store_id <> 0
""")

con.execute(f"""
CREATE VIEW product AS
SELECT p.product_id, p.product_name, p.brand_name AS brand,
       pc.product_family AS family, pc.product_department AS department,
       pc.product_category AS category, pc.product_subcategory AS subcategory,
       p.SRP::DOUBLE AS price,
       CASE WHEN p.low_fat = 1 THEN 'Allégé' ELSE 'Standard' END AS low_fat,
       CASE WHEN p.recyclable_package = 1 THEN 'Recyclable' ELSE 'Non recyclable' END AS recyclable
FROM {csv('product')} p
JOIN {csv('product_class')} pc USING (product_class_id)
""")

con.execute(f"""
CREATE VIEW promotion AS
SELECT promotion_id,
       CASE WHEN promotion_id = 0 THEN 'Sans promotion' ELSE promotion_name END AS promo_name,
       CASE WHEN promotion_id = 0 THEN 'Sans promotion' ELSE media_type END AS media_type,
       CASE WHEN promotion_id = 0 THEN 'Sans promotion' ELSE 'Avec promotion' END AS has_promo,
       cost::DOUBLE AS promo_cost
FROM {csv('promotion')}
""")

# ---------------------------------------------------------------- flattened fact
MONTHS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."]
con.execute(f"""
CREATE TABLE sales AS
SELECT v.the_year::INT AS year,
       CASE WHEN v.month_of_year <= 6 THEN 'S1' ELSE 'S2' END AS semester,
       v.quarter,
       v.month_of_year::INT AS month,
       list_extract({MONTHS!r}, v.month_of_year::INT) AS month_name,
       v.store_sales::DOUBLE AS sales,
       v.store_cost::DOUBLE AS cost,
       v.unit_sales::DOUBLE AS units,
       v.fact_count::INT AS lines,
       p.*, s.*, c.*, pr.*
FROM {csv('ventes')} v
JOIN product p USING (product_id)
JOIN store s USING (store_id)
JOIN customer c USING (customer_id)
JOIN promotion pr USING (promotion_id)
""")

n_raw = con.execute(f"SELECT count(*) FROM {csv('ventes')}").fetchone()[0]
n_out, total = con.execute("SELECT count(*), round(sum(sales), 2) FROM sales").fetchone()
assert n_raw == n_out, f"join lost rows: {n_raw} -> {n_out}"
print(f"sales: {n_out} rows, CA {total}")

con.execute(f"COPY sales TO '{OUT / 'sales.parquet'}' (FORMAT parquet, COMPRESSION zstd)")
con.execute(f"COPY (SELECT * FROM customer) TO '{OUT / 'customers.parquet'}' (FORMAT parquet, COMPRESSION zstd)")

# ---------------------------------------------------------------- geography
cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
places = con.execute("""
SELECT DISTINCT cust_city, cust_state, cust_country FROM customer
UNION SELECT DISTINCT store_city, store_state, store_country FROM store
""").fetchall()
COUNTRY = {"USA": "United States", "Canada": "Canada", "Mexico": "Mexico"}
STATE_NAME = {"DF": "Ciudad de Mexico", "BC": "British Columbia"}
for city, state, country in places:
    key = f"{city}|{state}"
    if key in cache:
        continue
    state_name = STATE_NAME.get(state, state)
    # fictitious/unknown localities fall back to coarser queries
    queries = [f"{city}, {state_name}, {COUNTRY[country]}", f"{city}, {COUNTRY[country]}", f"{state_name}, {COUNTRY[country]}"]
    res = []
    for q in queries:
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": q, "format": "json", "limit": 1})
        req = urllib.request.Request(url, headers={"User-Agent": "bi-c2-course-dashboard"})
        res = json.loads(urllib.request.urlopen(req, timeout=20).read())
        time.sleep(1.1)
        if res:
            break
    if not res:
        raise SystemExit(f"geocode failed: {queries}")
    cache[key] = [round(float(res[0]["lon"]), 5), round(float(res[0]["lat"]), 5)]
    print("geocoded", q, cache[key])
    CACHE.write_text(json.dumps(cache, indent=1, ensure_ascii=False, sort_keys=True))

if not NE_ADMIN1.exists():
    urllib.request.urlretrieve(NE_URL, NE_ADMIN1)
ne = json.loads(NE_ADMIN1.read_text())
# our state code -> (Natural Earth admin, postal)
STATES = {
    "CA": ("United States of America", "CA"), "OR": ("United States of America", "OR"),
    "WA": ("United States of America", "WA"), "BC": ("Canada", "BC"),
    "DF": ("Mexico", "DF"), "Zacatecas": ("Mexico", "ZA"), "Guerrero": ("Mexico", "GR"),
    "Jalisco": ("Mexico", "JA"), "Yucatan": ("Mexico", "YU"), "Mexico": ("Mexico", "MX"),
    "Veracruz": ("Mexico", "VE"), "Oaxaca": ("Mexico", "OA"), "Sinaloa": ("Mexico", "SI"),
}
used_states = {r[0] for r in con.execute("SELECT DISTINCT cust_state FROM customer UNION SELECT store_state FROM store").fetchall()}
features = []
for code, (admin, postal) in STATES.items():
    if code not in used_states:
        continue
    f = next(f for f in ne["features"] if f["properties"]["admin"] == admin and f["properties"]["postal"] == postal)
    geom = shape(f["geometry"]).simplify(0.02, preserve_topology=True)
    features.append({"type": "Feature", "id": code, "properties": {"state": code, "name": f["properties"]["name"]},
                     "geometry": mapping(geom)})
missing = used_states - {f["id"] for f in features}
assert not missing, f"no polygon for {missing}"

geo = {
    "states": {"type": "FeatureCollection", "features": features},
    "cities": {k: v for k, v in sorted(cache.items()) if tuple(k.split("|")) in {(c, s) for c, s, _ in places}},
}
(OUT / "geo.json").write_text(json.dumps(geo, ensure_ascii=False, separators=(",", ":")))
print(f"geo: {len(features)} states, {len(geo['cities'])} cities")
