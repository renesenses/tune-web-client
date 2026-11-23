/**
 * tune-server-rust#6482 (DidLyon, fils forum 2320 et 2321) — « une gestion de
 * bibliothèque qui adresse tant les fichiers locaux que les distants ».
 *
 * Périmètre rc7 (note de conception de l'issue) : dans Bibliothèque › Albums,
 * une bascule « Bibliothèque + favoris » ajoute à la grille les albums FAVORIS
 * des services (Qobuz, Tidal…), avec leur pastille de provenance. Ils passent
 * par la même recherche, le même tri et le même menu « Source » que les albums
 * locaux ; une carte ouvre la fiche de l'album du service.
 *
 * Les favoris de service sont le MIROIR du service (décision du 08/10) : ce
 * que l'écran montre est ce que le service tient en favori, rien de plus.
 *
 * Un album de service n'a pas d'`id` de bibliothèque : `id: null`, et sa
 * provenance est la paire `source` + `source_id`, comme partout ailleurs
 * (`cleDetailAlbum`, `objetAlbum`). La clé de carte n'est donc plus `a.id`
 * seul — deux albums de service la partageraient (`null`).
 */
import { get, writable } from 'svelte/store';
import * as api from './api';
import type { Album, Artist, Source, Track } from './types';

/** Ce que rend `GET /profiles/{id}/favorites/streaming?item_type=album`. */
export interface FavoriAlbumDeService {
  item_type: string;
  service: string;
  service_id: string;
  title?: string | null;
  artist?: string | null;
  cover_url?: string | null;
  created_at?: string | null;
  first_seen_at?: string | null;
}

/** Les sources qui ne sont PAS un service : leurs albums sont déjà dans la bibliothèque. */
const SOURCES_DE_BIBLIOTHEQUE = new Set(['local', 'upnp']);

function secondes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/**
 * Les albums favoris des services, en forme d'`Album` de grille. Dédoublonnés
 * par paire service + identifiant.
 *
 * tune-server-rust#8255 (fil 2600, décision de Bertrand du 22/11) — la date
 * d'ajout est la date de MISE EN FAVORI chez le service (`created_at`, que le
 * miroir remplit avec le `favorited_at` de Qobuz), à défaut celle où Tune a vu
 * le favori (`first_seen_at`). Avec `first_seen_at` d'abord, tous les favoris
 * importés d'un coup portaient la date de l'import et passaient AVANT les
 * albums locaux dans « Derniers ajouts », quelle que soit leur ancienneté.
 *
 * La réserve de web#1060 tient toujours : une recopie des favoris chez le
 * service peut recréer leurs dates, à quelques secondes d'écart. Ces favoris
 * se rangent alors ensemble, à la date de la recopie ; c'est la date que le
 * service donne, et non une date inventée.
 */
export function albumsDesFavorisDeService(favoris: readonly FavoriAlbumDeService[] | null | undefined): Album[] {
  const vus = new Set<string>();
  const albums: Album[] = [];
  for (const f of favoris ?? []) {
    if (f?.item_type !== 'album') continue;
    const service = (f.service ?? '').trim();
    const sid = (f.service_id ?? '').trim();
    if (!service || !sid || SOURCES_DE_BIBLIOTHEQUE.has(service)) continue;
    const cle = `${service}:${sid}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    albums.push({
      id: null,
      title: f.title ?? '',
      artist_name: f.artist ?? null,
      cover_path: f.cover_url ?? null,
      source: service as Source,
      source_id: sid,
      added_at: secondes(f.created_at) ?? secondes(f.first_seen_at),
    });
  }
  return albums;
}

/** Un album de SERVICE ajouté par la bascule (pas un album de bibliothèque). */
export function estAlbumDeServiceEtendu(a: Pick<Album, 'id' | 'source' | 'source_id'>): boolean {
  const s = (a.source ?? '').trim();
  return a.id == null && !!s && !SOURCES_DE_BIBLIOTHEQUE.has(s) && !!(a.source_id ?? '').toString().trim();
}

/** La clé de carte : l'`id` d'un album de bibliothèque, la paire d'un album de service. */
export function cleCarteAlbum(a: Pick<Album, 'id' | 'source' | 'source_id' | 'title'>): string | number {
  if (a.id != null) return a.id;
  return `svc:${a.source ?? ''}:${a.source_id ?? a.title ?? ''}`;
}

/** La grille : la bibliothèque, puis les favoris de service si la bascule est mise. */
export function albumsEtendus(bibliotheque: readonly Album[], favoris: readonly Album[], etendue: boolean): Album[] {
  return etendue && favoris.length ? [...bibliotheque, ...favoris] : (bibliotheque as Album[]);
}

/**
 * tune-server-rust#7780 (fil 2635) — le bouton « Bibliothèque + favoris »
 * devient le réglage « Bibliothèque élargie aux favoris des services » de
 * Paramètres › Bibliothèque, tenu par le serveur pour chaque profil et
 * ACTIVÉ par défaut. Un serveur qui ne connaît pas encore le réglage (route
 * absente) ou injoignable laisse la valeur par défaut.
 */
export const bibliothequeEtendueActive = writable<boolean>(true);
/** Le réglage a été lu (ou le serveur n'en sait rien) : la Bibliothèque attend ce moment pour ne pas demander des favoris qu'elle n'affichera pas. */
export const reglageEtendueLu = writable<boolean>(false);

export async function chargerReglageEtendue(profileId: number): Promise<boolean> {
  let actif = true;
  try {
    actif = (await api.getBibliothequeEtendue(profileId))?.enabled !== false;
  } catch {
    /* serveur ancien : la valeur par défaut tient */
  }
  bibliothequeEtendueActive.set(actif);
  reglageEtendueLu.set(true);
  return actif;
}

/** Écrit le réglage ; rend la valeur d'avant si le serveur refuse. */
export async function changerReglageEtendue(profileId: number, actif: boolean): Promise<void> {
  const avant = get(bibliothequeEtendueActive);
  bibliothequeEtendueActive.set(actif);
  try {
    const r = await api.setBibliothequeEtendue(profileId, actif);
    bibliothequeEtendueActive.set(r?.enabled ?? actif);
  } catch (e) {
    bibliothequeEtendueActive.set(avant);
    throw e;
  }
}

/**
 * Fil 3009, point 6 (FabienM, rc13) — « Menu bibliothèque : onglets Titres et
 * Artistes : la source Qobuz est absente (alors que j'ai des titres et
 * artistes favoris Qobuz). Le paramètre "Bibliothèque élargie aux favoris des
 * services" est activé. »
 *
 * Le réglage n'élargissait que l'onglet ALBUMS (#6482, #7780). Les onglets
 * Titres et Artistes reçoivent désormais, de la même façon, les titres et les
 * artistes favoris des services (`GET /profiles/{id}/favorites/streaming?
 * item_type=track|artist&pour=bibliotheque`), chacun sous sa provenance : le
 * menu « Source » les propose, et choisir le service les montre.
 */
export interface FavoriDeService {
  item_type: string;
  service: string;
  service_id: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  album_id_service?: string | null;
  cover_url?: string | null;
}

/** La paire service + identifiant d'un favori de service, ou `null`. */
function paireDeService(f: FavoriDeService | null | undefined, type: string): { service: string; sid: string } | null {
  if (f?.item_type !== type) return null;
  const service = (f.service ?? '').trim();
  const sid = String(f.service_id ?? '').trim();
  if (!service || !sid || SOURCES_DE_BIBLIOTHEQUE.has(service)) return null;
  return { service, sid };
}

/** Les TITRES favoris des services, en forme de `Track`, dédoublonnés par paire. */
export function pistesDesFavorisDeService(favoris: readonly FavoriDeService[] | null | undefined): Track[] {
  const vus = new Set<string>();
  const pistes: Track[] = [];
  for (const f of favoris ?? []) {
    const p = paireDeService(f, 'track');
    if (!p || vus.has(`${p.service}:${p.sid}`)) continue;
    vus.add(`${p.service}:${p.sid}`);
    pistes.push({
      id: null,
      title: f.title ?? '',
      artist_name: f.artist ?? null,
      album_title: f.album ?? null,
      cover_path: f.cover_url ?? null,
      source: p.service as Source,
      source_id: p.sid,
      album_id_service: (f.album_id_service ?? '').toString().trim() || null,
    } as Track);
  }
  return pistes;
}

/** Un artiste favori d'un service : pas d'`id` de bibliothèque, sa paire service + identifiant. */
export type ArtisteDeService = Artist & { source: string; source_id: string };

/** Les ARTISTES favoris des services, dédoublonnés par paire. */
export function artistesDesFavorisDeService(favoris: readonly FavoriDeService[] | null | undefined): ArtisteDeService[] {
  const vus = new Set<string>();
  const artistes: ArtisteDeService[] = [];
  for (const f of favoris ?? []) {
    const p = paireDeService(f, 'artist');
    if (!p || vus.has(`${p.service}:${p.sid}`)) continue;
    vus.add(`${p.service}:${p.sid}`);
    artistes.push({ id: null, name: (f.title ?? f.artist ?? '').trim(), image_path: f.cover_url ?? null, source: p.service, source_id: p.sid } as ArtisteDeService);
  }
  return artistes;
}

/** La source choisie désigne-t-elle un SERVICE (et non la bibliothèque) ? */
export function estSourceDeService(source: string | null | undefined): boolean {
  const s = (source ?? '').trim();
  return !!s && !SOURCES_DE_BIBLIOTHEQUE.has(s) && !s.startsWith('upnp:');
}

/** Ajoute aux comptes du menu « Source » ceux des favoris de service (chacun sous son service). */
export function comptesAvecFavoris(
  comptes: ReadonlyMap<string, number>,
  favoris: readonly { source?: string | null }[],
): Map<string, number> {
  const out = new Map(comptes);
  for (const f of favoris) {
    const s = (f.source ?? '').trim();
    if (!estSourceDeService(s)) continue;
    out.set(s, (out.get(s) ?? 0) + 1);
  }
  return out;
}

/* ── Fil 3009, point 6, suite (décision de Bertrand du 23/11) ─────────────
 * Les favoris des services s'affichent AUSSI sous « Toutes les sources »,
 * dans Titres et dans Artistes, comme dans l'onglet Albums — SANS DOUBLON :
 * un titre ou un artiste déjà présent dans la bibliothèque, ou déjà apporté
 * par un autre service, n'apparaît qu'une fois. La bibliothèque l'emporte,
 * puis le premier service rencontré. L'onglet Albums n'avait pas de règle de
 * dédoublonnage à reprendre (`albumsEtendus` concatène) : celle-ci compare
 * le titre et l'interprète (artiste : le nom), sans casse, accents ni
 * espaces superflus. */

/** Un texte comparable : sans casse, accents ni espaces superflus. */
export function plierTexte(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** La clé « même titre » : titre et interprète pliés. */
export function cleDeTitre(t: { title?: string | null; artist_name?: string | null }): string {
  return `${plierTexte(t.title)}|${plierTexte(t.artist_name)}`;
}

/** Les titres favoris qui n'existent ni dans `locaux`, ni plus tôt dans la liste (autre service). */
export function titresSansDoublon<T extends { title?: string | null; artist_name?: string | null }>(
  locaux: readonly { title?: string | null; artist_name?: string | null }[],
  favoris: readonly T[],
): T[] {
  const vus = new Set(locaux.map(cleDeTitre));
  return favoris.filter((f) => {
    const k = cleDeTitre(f);
    if (!plierTexte(f.title) || vus.has(k)) return false;
    vus.add(k);
    return true;
  });
}

/** Les artistes favoris qui n'existent ni dans `locaux`, ni plus tôt dans la liste (autre service). */
export function artistesSansDoublon<T extends { name?: string | null }>(
  locaux: readonly { name?: string | null }[],
  favoris: readonly T[],
): T[] {
  const vus = new Set(locaux.map((a) => plierTexte(a.name)));
  return favoris.filter((f) => {
    const k = plierTexte(f.name);
    if (!k || vus.has(k)) return false;
    vus.add(k);
    return true;
  });
}

/** Une page de pistes de la bibliothèque, pour un titre cherché (`getPagePistes`). */
export type ChargeurDeRecherche = (
  titre: string,
  offset: number,
  limit: number,
  signal: AbortSignal,
) => Promise<readonly { id?: unknown; source?: unknown; title?: string | null; artist_name?: string | null }[]>;

/** Taille des pages du contrôle de présence, et nombre de pages au plus par titre. */
export const PAGE_PRESENCE = 200;
export const PAGES_PRESENCE_MAX = 10;

/**
 * Relecture du 23/11 — les réponses du contrôle de présence vivent au niveau
 * du MODULE, par provenance, jusqu'au prochain scan (`generation`) : rouvrir
 * la Bibliothèque ne relance pas une recherche par favori. Les recherches EN
 * VOL y sont aussi, pour qu'un même titre ne soit jamais cherché deux fois à
 * la fois.
 */
interface CachePresences { generation: unknown; parProvenance: Map<string, Map<string, boolean>> }
const cachePresences: CachePresences = { generation: undefined, parProvenance: new Map() };
/** Les recherches en vol, par cache : la promesse et le signal de qui l'a lancée. */
const enVolParCache = new WeakMap<Map<string, boolean>, Map<string, { promesse: Promise<boolean>; signal: AbortSignal }>>();

/** Le cache de présence d'une provenance (`null` : toutes), vidé quand la bibliothèque change. */
export function presencesDeLaProvenance(provenance: string | null, generation: unknown): Map<string, boolean> {
  if (cachePresences.generation !== generation) {
    cachePresences.generation = generation;
    cachePresences.parProvenance = new Map();
  }
  const cle = provenance ?? '*';
  let m = cachePresences.parProvenance.get(cle);
  if (!m) { m = new Map(); cachePresences.parProvenance.set(cle, m); }
  return m;
}

/** Pour les tests : oublie toutes les réponses. */
export function _oublierPresencesPourTests(): void {
  cachePresences.generation = undefined;
  cachePresences.parProvenance = new Map();
}

function annulee(signal: AbortSignal | undefined): boolean {
  return !!signal?.aborted;
}

/** Le titre est-il dans la bibliothèque ? Page après page tant qu'il n'est pas trouvé. */
async function presentDansLaBibliotheque(
  f: { title?: string | null; artist_name?: string | null },
  charger: ChargeurDeRecherche,
  signal: AbortSignal,
): Promise<boolean> {
  const k = cleDeTitre(f);
  for (let page = 0; page < PAGES_PRESENCE_MAX; page++) {
    const lot = await charger(String(f.title ?? ''), page * PAGE_PRESENCE, PAGE_PRESENCE, signal);
    if (lot.some((t) => t.id != null && cleDeTitre(t) === k)) return true;
    // Une page incomplète est la dernière : un titre courant (« Intro ») ne
    // s'arrête plus aux premiers résultats d'autres interprètes.
    if (lot.length < PAGE_PRESENCE) return false;
  }
  // Au-delà, on ne conclut pas à l'absence : pas de doublon possible.
  return true;
}

/**
 * Onglet Titres PAGINÉ : la bibliothèque n'est pas en mémoire, seule sa
 * fenêtre l'est. Pour savoir si un titre favori y est déjà, on la demande au
 * serveur par une recherche sur son titre (`charger`, sous la provenance
 * affichée : toute ligne de la bibliothèque qu'elle rend compte, sur toutes
 * ses pages), au plus `concurrence` à la fois. Chaque réponse est retenue dans
 * `cache` ; une recherche déjà en vol pour le même titre est partagée.
 *
 * Relecture du 23/11 : un ÉCHEC n'est pas retenu — le favori est écarté pour
 * cette passe (jamais de doublon), et cherché de nouveau à la suivante. Une
 * passe annulée (`signal`) n'écrit rien et rend une liste vide.
 */
export async function titresAbsentsDeLaBibliotheque<T extends { title?: string | null; artist_name?: string | null }>(
  favoris: readonly T[],
  charger: ChargeurDeRecherche,
  cache: Map<string, boolean>,
  signal: AbortSignal = new AbortController().signal,
  concurrence = 4,
): Promise<T[]> {
  const uniques = titresSansDoublon([], favoris);
  const aVerifier = uniques.filter((f) => !cache.has(cleDeTitre(f)));
  let enVol = enVolParCache.get(cache);
  if (!enVol) { enVol = new Map(); enVolParCache.set(cache, enVol); }
  const vols = enVol;
  /** La recherche de `f` : celle déjà en vol (d'une passe non annulée), sinon une nouvelle. */
  const rechercher = (f: T, k: string): Promise<boolean> => {
    const deja = vols.get(k);
    if (deja && !deja.signal.aborted) return deja.promesse;
    const promesse = presentDansLaBibliotheque(f, charger, signal);
    const entree = { promesse, signal };
    vols.set(k, entree);
    const liberer = () => { if (vols.get(k) === entree) vols.delete(k); };
    // Annulée, elle quitte la table tout de suite : la passe suivante relance la sienne.
    signal.addEventListener('abort', liberer, { once: true });
    promesse.then((present) => { if (!signal.aborted) cache.set(k, present); }, () => {}).finally(liberer);
    return promesse;
  };
  let i = 0;
  const ouvrier = async () => {
    while (i < aVerifier.length && !annulee(signal)) {
      const f = aVerifier[i++];
      const k = cleDeTitre(f);
      for (let essai = 0; essai < 2 && !annulee(signal); essai++) {
        const vol = vols.get(k);
        try {
          const present = await rechercher(f, k);
          if (!annulee(signal)) cache.set(k, present);
          break;
        } catch {
          // La recherche partagée d'une passe ANNULÉE : on relance la nôtre une fois.
          // Sinon (échec réel) : écarté pour cette passe, cherché à la suivante.
          if (!(vol && vol.signal !== signal && vol.signal.aborted)) break;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrence, aVerifier.length)) }, ouvrier));
  if (annulee(signal)) return [];
  return uniques.filter((f) => cache.get(cleDeTitre(f)) === false);
}
