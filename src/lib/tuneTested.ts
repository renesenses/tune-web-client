/**
 * Le catalogue « Tune tested » — les appareils dont une configuration a été
 * validée à la main sur mozaiklabs.fr.
 *
 * Chantier ouvert par Bertrand le 08/09/2026, objectif 3 : « afficher avec un
 * badge les appareils Tune tested sur la page Réglages/Appareils ».
 *
 * ## ⚠️ Cet appel sort de la page, et le dépôt s'y refuse d'ordinaire
 *
 * `api.ts` porte une règle en toutes lettres : « ne plus jamais appeler
 * mozaiklabs.fr depuis la page », pour trois raisons. Elles ne valent pas
 * toutes ici :
 *
 *  1. **CORS** — levée pour CETTE route seulement. `/tune-tested.json` est
 *     servie hors de `api/*` avec `Access-Control-Allow-Origin: *` (déployé le
 *     08/09/2026). Vérifiable : `curl -I https://mozaiklabs.fr/tune-tested.json`.
 *  2. **La clé de licence dans l'URL** — sans objet : la route est publique et
 *     ne demande aucune authentification. Avec `*`, le navigateur refuse même
 *     d'envoyer des identifiants.
 *  3. **Le débit consommé par tout le parc** — 🔴 CELLE-CI TIENT TOUJOURS. Sans
 *     précaution, chaque client rejouerait l'appel à chaque changement d'écran.
 *
 * D'où le cache : UNE requête par navigateur et par jour, au plus. Le résultat
 * survit au rechargement, et un échec ne coûte rien puisque le badge est un
 * ornement, jamais une information dont dépend une décision.
 *
 * ## Le jour où le serveur relaiera
 *
 * La vraie place de cet appel est le serveur local (issue tune-server-rust
 * #3589) : pas de CORS, une requête par installation au lieu d'une par
 * navigateur, et le catalogue disponible hors ligne. Ce module devra alors lire
 * la route locale et cet appel sortant disparaîtra. Il est écrit pour être
 * remplacé.
 */

/** Ce que rend `https://mozaiklabs.fr/tune-tested.json`. */
export interface AppareilTuneTested {
  brand: string;
  model: string;
  output_type: string | null;
  /** `tune.renderer.v1` (réglages de zone) ou `tune.quirks.v1` (catalogue). */
  vocabulary?: string;
  settings: Record<string, unknown>;
  households: number;
  validated_at: string | null;
  note: string | null;
}

export interface CatalogueTuneTested {
  version: number;
  count: number;
  devices: AppareilTuneTested[];
}

export const URL_CATALOGUE = 'https://mozaiklabs.fr/tune-tested.json';
const CLE_CACHE = 'tune_v2_catalogue_tune_tested';
/** Une requête par navigateur et par jour, au plus. Voir la raison 3 ci-dessus. */
export const DUREE_CACHE_MS = 24 * 60 * 60 * 1000;

/**
 * Les raisons sociales que la découverte UPnP colle aux marques.
 *
 * Mesuré sur le .18 le 08/09/2026 : `manufacturer: "Sonos, Inc."` là où le
 * catalogue dit « Sonos ». Sans les retirer, aucun Sonos ne porterait jamais
 * son badge.
 */
const SUFFIXES =
  /[\s,]+(inc|inc\.|incorporated|llc|ltd|ltd\.|limited|gmbh|sas|sa|corp|corp\.|corporation|co|co\.|company|bv|b\.v\.|a\/s|kk|k\.k\.)$/i;

const plier = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/[\s_]+/g, ' ').trim();

/**
 * La clef d'un appareil, insensible à la graphie.
 *
 * 🔴 Elle DOIT plier comme le site, sinon rien ne se rencontrera jamais : le
 * catalogue s'indexe sur `brand_key`/`model_key`, obtenus par `mb_strtolower`
 * puis `[\s_]+` ramené à une espace simple.
 *
 * Elle plie DAVANTAGE sur un point, et c'est nécessaire : la découverte rend
 * des raisons sociales, pas des marques (voir `SUFFIXES`).
 *
 * `null` sans modèle : une marque seule ne désigne aucun appareil, et le
 * catalogue lui-même refuse d'enregistrer un modèle bouche-trou.
 */
export function clefAppareil(
  marque: string | null | undefined,
  modele: string | null | undefined,
): string | null {
  let marqueP = plier(marque);
  // On retire tant qu'il en reste : « Sonos, Inc. » puis « Sonos, Inc » ne sont
  // qu'un cas parmi d'autres.
  let avant: string;
  do {
    avant = marqueP;
    marqueP = plier(marqueP.replace(SUFFIXES, ''));
  } while (marqueP !== avant && marqueP !== '');

  const modeleP = plier(modele);
  if (!modeleP) return null;
  return `${marqueP} ${modeleP}`;
}

/** Index par clef, pour une recherche en temps constant sur chaque ligne. */
export function indexer(catalogue: CatalogueTuneTested | null): Map<string, AppareilTuneTested> {
  const index = new Map<string, AppareilTuneTested>();
  for (const a of catalogue?.devices ?? []) {
    const clef = clefAppareil(a.brand, a.model);
    if (clef) index.set(clef, a);
  }
  return index;
}

interface Cache {
  at: number;
  catalogue: CatalogueTuneTested;
}

function lireCache(): CatalogueTuneTested | null {
  try {
    const brut = localStorage.getItem(CLE_CACHE);
    if (!brut) return null;
    const c = JSON.parse(brut) as Cache;
    if (!c?.catalogue || typeof c.at !== 'number') return null;
    if (Date.now() - c.at > DUREE_CACHE_MS) return null;
    return c.catalogue;
  } catch {
    // Stockage refusé (navigation privée, données de site bloquées) : on s'en
    // passe, quitte à redemander.
    return null;
  }
}

function ecrireCache(catalogue: CatalogueTuneTested): void {
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify({ at: Date.now(), catalogue } satisfies Cache));
  } catch {
    /* stockage refusé : tant pis, on rechargera */
  }
}

let enVol: Promise<CatalogueTuneTested | null> | null = null;

/**
 * Le catalogue, du cache ou du réseau.
 *
 * `null` en cas d'échec — hors ligne, site indisponible, réponse illisible. Le
 * badge disparaît alors, et c'est tout : il ne doit JAMAIS empêcher l'écran de
 * s'afficher, ni faire croire qu'un appareil n'est pas validé.
 *
 * Les appels concurrents partagent la même requête : trois composants montés
 * ensemble ne font pas trois allers-retours.
 */
export function chargerCatalogueTuneTested(
  fetcher: typeof fetch = fetch,
): Promise<CatalogueTuneTested | null> {
  const duCache = lireCache();
  if (duCache) return Promise.resolve(duCache);
  if (enVol) return enVol;

  enVol = fetcher(URL_CATALOGUE, { credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: any) => {
      // On ne range que ce qui a la FORME attendue : un corps d'erreur HTML ou
      // une page de maintenance ne doit pas s'installer dans le cache pour la
      // journée.
      if (!d || !Array.isArray(d.devices)) return null;
      const catalogue: CatalogueTuneTested = {
        version: Number(d.version) || 0,
        count: Number(d.count) || d.devices.length,
        devices: d.devices,
      };
      ecrireCache(catalogue);
      return catalogue;
    })
    .catch(() => null)
    .finally(() => {
      enVol = null;
    });

  return enVol;
}

/** Pour les tests : oublier le cache mémoire ET le cache navigateur. */
export function oublierCatalogue(): void {
  enVol = null;
  try {
    localStorage.removeItem(CLE_CACHE);
  } catch {
    /* ignore */
  }
}
