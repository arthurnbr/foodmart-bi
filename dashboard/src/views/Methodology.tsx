import { useApp } from '../lib/state'

const STACK: { layer: string; tech: string; why: string; alt: string }[] = [
  {
    layer: 'Préparation',
    tech: 'Python + DuckDB',
    why: "Le flocon (8 CSV) est joint, nettoyé et aplati en une seule table de faits Parquet de 2 Mo. DuckDB lit les CSV directement en SQL et vérifie que la jointure ne perd aucune ligne (86 805 en entrée = 86 805 en sortie).",
    alt: 'pandas : même résultat mais transformations moins lisibles et non rejouables en SQL.',
  },
  {
    layer: 'Moteur analytique',
    tech: 'DuckDB-WASM',
    why: "La même base SQL colonnaire, compilée en WebAssembly, tourne dans le navigateur. Chaque clic génère des requêtes SQL exécutées localement en quelques millisecondes : pas de serveur, pas de cube OLAP à pré-calculer, toutes les combinaisons d'axes restent possibles.",
    alt: 'Power BI / Superset : serveur ou licence, drill limité aux hiérarchies déclarées, interface non personnalisable.',
  },
  {
    layer: 'Interface',
    tech: 'React 19 + TypeScript + Vite',
    why: "Un modèle sémantique typé (mesures, dimensions, hiérarchies) alimente tous les visuels. L'état (filtres, mesure, page) vit dans l'URL : bouton Précédent = annuler, lien = vue partagée.",
    alt: '—',
  },
  {
    layer: 'Graphiques',
    tech: 'Apache ECharts 6',
    why: 'Treemap imbriqué natif pour le drill produit, rendu Canvas fluide, événements de clic branchés sur le moteur de filtres.',
    alt: 'Recharts / Chart.js : pas de treemap hiérarchique ; D3 : tout à coder.',
  },
  {
    layer: 'Carte',
    tech: 'MapLibre GL + OpenFreeMap',
    why: 'Carte vectorielle WebGL open source : aplats par État, bulles par ville, points par magasin, zoom fluide. Géocodage des 109 villes via Nominatim, contours Natural Earth.',
    alt: 'Leaflet : rendu raster, moins fluide ; Mapbox : clé payante.',
  },
  {
    layer: 'Déploiement',
    tech: 'Docker (nginx) sur Coolify',
    why: 'Le résultat est un site statique : une image nginx de quelques dizaines de Mo, compression gzip du moteur (36 Mo → 8 Mo), déploiement automatique depuis GitHub.',
    alt: '—',
  },
]

const UX: { title: string; body: string }[] = [
  { title: 'Une seule grammaire de clic', body: "Partout : clic = filtrer ou descendre d'un niveau, Ctrl + clic = sélection multiple, clic sur le fil d'Ariane = remonter. Rien à réapprendre d'une vue à l'autre." },
  { title: 'Le contexte toujours visible', body: "La barre « Contexte » sous la navigation montre chaque filtre et chaque chemin de drill. On sait toujours sur quel périmètre portent les chiffres." },
  { title: 'Filtrer sans perdre la comparaison', body: "Un visuel ignore le filtre posé sur son propre axe : il surligne la sélection au lieu de se réduire à une seule barre. On voit le choix ET les alternatives." },
  { title: "Explorer, pas seulement regarder", body: "Explorateur (tableau croisé à niveaux libres), arbre de décomposition, palette de recherche Ctrl K : l'utilisateur pose ses propres questions au lieu de consommer des graphiques figés." },
  { title: 'Mesure au choix, partout', body: "Un clic sur une carte d'indicateur bascule tous les visuels sur cette mesure. Les mesures non additives (taux, moyennes, clients distincts) sont recalculées à chaque niveau, jamais additionnées." },
  { title: "Rien n'est perdu", body: "État dans l'URL (Précédent = annuler, lien = partage), vues enregistrées nommées, export CSV de l'explorateur." },
]

const STEPS: { title: string; body: string }[] = [
  { title: 'Comprendre les données', body: "Profilage des 8 tables : clés, cardinalités, jointures orphelines, grain de la table de faits (produit × client × magasin × promotion × mois). Détection des pièges : liaison sales_region incohérente, hiérarchie produit non stricte, une seule année." },
  { title: 'Définir les KPI et les axes', body: "Liste des mesures et des hiérarchies de drill par axe (temps, produit, magasin, localisation client, profil client, promotion), validée avec l'utilisateur avant de construire." },
  { title: 'Construire', body: "Pipeline de préparation, modèle sémantique, moteur de filtres croisés, puis les vues une par une. Les totaux affichés sont recoupés avec des requêtes SQL indépendantes (ex. CA marié(e)s × Salem = 40 515 $)." },
  { title: 'Vérifier dans un vrai navigateur', body: "Chaque vue testée par un navigateur piloté : clics, drill, carte, mobile, build de production. Bugs trouvés ainsi et corrigés : chemin du moteur WASM, worker de la carte, zoom automatique, débordement mobile." },
  { title: 'Itérer avec l\'utilisateur', body: "Retours intégrés : granularité temporelle, vues enregistrées, carte plein écran, filtres accessibles partout, visite guidée, cette page." },
]

export function Methodology() {
  const { setTab } = useApp()
  return (
    <article className="method">
      <header className="method-hero">
        <p className="method-eyebrow">Méthodologie</p>
        <h1>Comment ce reporting a été construit</h1>
        <p className="method-lead">
          D'un export de 8 fichiers CSV à une application d'exploration en ligne, sans serveur de base de données.
          Tout le code, de la préparation des données à l'interface, a été écrit par un agent IA dirigé par un humain.
        </p>
      </header>

      <section className="method-section">
        <h2>L'équipe : un humain + un agent</h2>
        <div className="method-duo">
          <div className="method-card">
            <h3>omp <span>(oh-my-pi)</span></h3>
            <p>Agent de développement en ligne de commande. Il donne au modèle des outils réels : lire et écrire les fichiers, lancer des commandes, exécuter du Python et du SQL, piloter un navigateur Chromium pour tester l'interface, se connecter aux serveurs en SSH pour déployer.</p>
          </div>
          <div className="method-card">
            <h3>Claude Opus 5.5 <span>(Anthropic)</span></h3>
            <p>Le modèle de langage qui raisonne : analyse des données, choix de la stack, écriture du code, diagnostic des bugs à partir des captures d'écran et des erreurs, rédaction des textes. Chaque affirmation chiffrée est recoupée par une requête avant d'être affichée.</p>
          </div>
          <div className="method-card">
            <h3>L'utilisateur</h3>
            <p>Fixe l'objectif (« explorer les ventes par région, ville, statut marital »), valide les KPI, juge l'UX et demande les ajustements. L'agent propose et exécute ; l'humain décide.</p>
          </div>
        </div>
      </section>

      <section className="method-section">
        <h2>Les étapes</h2>
        <ol className="method-steps">
          {STEPS.map((s) => <li key={s.title}><b>{s.title}</b><p>{s.body}</p></li>)}
        </ol>
      </section>

      <section className="method-section">
        <h2>La stack, et pourquoi</h2>
        <div className="method-arch" aria-label="Architecture">
          <span>8 CSV</span><i>→</i><span>DuckDB (Python)<small>nettoyage, jointures</small></span><i>→</i>
          <span>Parquet 2 Mo<small>+ géographie</small></span><i>→</i><span className="hl">DuckDB-WASM<small>SQL dans le navigateur</small></span><i>⇄</i>
          <span>React · ECharts · MapLibre<small>chaque clic = requêtes SQL</small></span>
        </div>
        <div className="method-table-wrap">
          <table className="method-table">
            <thead><tr><th>Couche</th><th>Techno</th><th>Pourquoi</th><th>Écarté</th></tr></thead>
            <tbody>
              {STACK.map((s) => (
                <tr key={s.layer}><th>{s.layer}</th><td><b>{s.tech}</b></td><td>{s.why}</td><td className="muted">{s.alt}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="method-section">
        <h2>Les choix d'UX</h2>
        <div className="method-grid">
          {UX.map((u) => <div key={u.title} className="method-card"><h3>{u.title}</h3><p>{u.body}</p></div>)}
        </div>
      </section>

      <section className="method-section">
        <h2>Ce que disent (et ne disent pas) les données</h2>
        <ul className="method-list">
          <li><b>Granularité temporelle maximale : le mois.</b> L'export ne contient que l'année 2024, sans date de transaction au jour. On peut analyser par semestre, trimestre et mois et comparer à la période précédente, mais pas l'année N-1, ni les semaines ou les jours de la semaine.</li>
          <li><b>Seuls 13 magasins vendent, tous aux USA</b> (Californie, Oregon, Washington). Canada et Mexique existent dans les référentiels mais sans vente.</li>
          <li><b>Prix de vente = prix catalogue</b> sur 100 % des lignes : une promotion se lit en volume, pas en remise.</li>
          <li><b>Corrections appliquées :</b> liaison magasin → région via <code>region_id</code> (le champ <code>sales_region_id</code> est incohérent), « Marida » → « Merida », clients de Mexico City rattachés au DF.</li>
          <li><b>Hiérarchie produit non stricte</b> (« Dairy » existe en Food et en Drink) : le drill fixe tous les niveaux parents pour ne jamais mélanger les montants.</li>
        </ul>
      </section>

      <footer className="method-foot">
        <button className="btn btn-accent" onClick={() => setTab('overview')}>Explorer les ventes</button>
        <a className="btn" href="https://github.com/arthurnbr/foodmart-bi" target="_blank" rel="noreferrer">Code source</a>
      </footer>
    </article>
  )
}
