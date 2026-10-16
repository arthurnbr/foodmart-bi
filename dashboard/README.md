# FoodMart · reporting dynamique des ventes 2024

Application web d'exploration des ventes : filtres croisés, drill-down sur les hiérarchies, carte, tableau croisé, arbre de décomposition. Tout le calcul se fait **dans le navigateur** : aucun serveur de base de données.

## Lancer

```bash
# 1. préparer les données (depuis le dossier parent, une seule fois ou après un nouvel export)
python -m venv .venv && .venv/bin/pip install duckdb shapely
.venv/bin/python prep/build.py

# 2. lancer l'interface
cd dashboard
npm install
npm run dev        # http://localhost:5173
npm run build      # site statique dans dist/, déployable tel quel (Nginx, GitHub Pages, Netlify…)
```

## Architecture

```
CSV export ──► prep/build.py (DuckDB) ──► public/data/*.parquet + geo.json
                                               │
                     navigateur ◄──────────────┘
                     DuckDB-WASM (SQL analytique en mémoire, ~10 ms par requête)
                        ▲          │
       filtres / drill  │          ▼ résultats
                     React ── ECharts (graphiques) · MapLibre GL (carte) · tableaux
```

| Couche | Techno | Rôle |
|---|---|---|
| Préparation | **DuckDB** (Python) | Nettoyage, jointures du flocon vers une table de faits aplatie, export **Parquet** (2 Mo). Géocodage des 109 villes via Nominatim (mis en cache dans `prep/geocode.json`), contours des États via Natural Earth. |
| Moteur | **DuckDB-WASM** | Base SQL analytique compilée en WebAssembly. Chaque clic génère des requêtes SQL exécutées localement : pas de latence réseau, pas de cube à pré-calculer. |
| Interface | **React 19 + TypeScript + Vite** | État global (filtres, mesure, vue) synchronisé avec l'URL. |
| Graphiques | **Apache ECharts 6** | Treemap drillable, courbes et barres, nuage de points. Rendu Canvas. |
| Carte | **MapLibre GL** + fond OpenFreeMap | Carte vectorielle WebGL : aplat par État, bulles par ville, points par magasin. |
| Recherche | **cmdk** | Palette `Ctrl K` : recherche parmi environ 9 000 membres (produits, marques, villes, clients, campagnes). |

## Modèle sémantique (`src/lib/model.ts`)

Une seule déclaration alimente tous les visuels.

- **Mesures** : CA, marge, taux de marge, coût, unités, lignes d'achat, clients actifs, CA par client, prix moyen, CA par ligne. Les mesures non additives (taux, moyennes, clients distincts) sont **recalculées** à chaque niveau, jamais additionnées.
- **Hiérarchies de drill** :
  - Temps : trimestre → mois
  - Produit : famille → département → catégorie → sous-catégorie → produit
  - Réseau : région commerciale → État → ville → magasin
  - Client : pays → État → ville → client
  - Promotion : avec/sans → média → campagne
- **Axes à plat** : statut marital, genre, tranche d'âge, revenu, éducation, profession, carte fidélité, logement, enfants, voitures, type de magasin, marque, tranche de prix, allégé, emballage.

## Grammaire d'interaction (identique partout)

| Geste | Effet |
|---|---|
| Clic sur un élément d'une hiérarchie | **Drill-down** : fixe ce niveau, le visuel descend au niveau suivant |
| Clic sur un élément à plat | Filtre (re-clic : retire le filtre) |
| `Ctrl`/`⌘` + clic | Sélection multiple |
| Clic sur un maillon de la barre « Contexte » | **Drill-up** jusqu'à ce niveau |
| Bouton Précédent du navigateur | Annule la dernière action (l'état est dans l'URL) |
| Copier l'URL | Partage la vue exacte (filtres + mesure + onglet) |
| Clic sur une carte KPI | Change la mesure analysée dans **tous** les visuels |
| Glisser sur la barre « Période » | Sélectionne une plage de mois ; S1/S2/T1…T4 en un clic |
| Bouton « Filtres » | Panneau latéral avec tous les axes à plat (Qui achète ? / Où ? / Quoi ?), sur toutes les pages |
| Bouton « Vues » | Enregistre le contexte sous un nom (localStorage), le rouvre, copie son lien |
| Bouton « ? » | Relance la visite guidée (affichée automatiquement à la première visite) |

Un visuel ignore le filtre portant sur sa propre dimension : il met la sélection en évidence au lieu de se réduire à un seul élément, ce qui permet toujours de comparer.

## Vues

- **Vue d'ensemble** : 6 KPI comparés à la période précédente de même durée (T4 vs T3, mars vs février ; année entière : S2 vs S1), courbe mensuelle avec la période surlignée, tendance mensuelle découpable par axe, réseau de magasins, treemap produit à deux niveaux imbriqués, 10 profils clients.
- **Carte** : plein écran, panneau de classement flottant et repliable ; 3 couches (États clients, villes clientes, magasins), légende, recadrage automatique sur la sélection, infobulle avec taux de pénétration.
- **Explorateur** : tableau croisé en arbre ; lignes = n'importe quelle chaîne de dimensions (hiérarchie prédéfinie ou personnalisée, jusqu'à 6 niveaux), colonnes = plusieurs mesures ou une dimension croisée ; tri, coloration par intensité, export CSV.
- **Décomposition** : arbre « d'où vient le chiffre » ; on choisit librement l'axe de chaque colonne, puis le chemin choisi peut être appliqué comme filtre global.
- **Promotions** : part du CA sous promotion, CA par média, rentabilité des campagnes (coût vs CA, échelle logarithmique).
- **Méthodologie** : démarche (omp + Claude Opus 5.5), étapes, stack et alternatives écartées, choix d'UX, limites des données.

## Temps : ce que permettent les données

Granularité maximale : **le mois**, sur une seule année (2024). Axes disponibles : semestre → trimestre → mois, plus deux ancienneté dérivées (« Client depuis » 1990–1994, « Ancienneté du magasin »). Impossible : N-1, semaines, jours de la semaine (pas de date de transaction dans l'export).

## Choix sur les données (voir `prep/build.py`)

- `store.sales_region_id` → `sales_region` est incohérent (Bellingham, WA rattaché à NY) : on utilise `store.region_id` → `region`.
- Corrections : district « Marida » → « Merida », clients de Mexico City en état « Mexico » → « DF ».
- La hiérarchie produit n'est pas stricte (« Dairy » existe en Food et en Drink) : le drill fixe tous les niveaux parents, donc les montants ne se mélangent jamais.
- Une seule année (2024) au grain mensuel : pas de comparaison N-1 ; comparaison à la période précédente de même durée.
- Prix de vente = prix catalogue dans 100 % des lignes : l'effet d'une promotion se lit en volume, pas en remise.
