/**
 * LA DISCOGRAPHIE COMMUNE D'UN ARTISTE — renesenses/tune-server-rust#4330.
 *
 * FabienM, fil forum 1823 « Page artiste commune » (16/09/2026), sur le modèle
 * de Roon : une seule grille pour la bibliothèque et les services, où
 *
 *   « Si un album est présent dans plusieurs sources alors celui-ci n'est pas
 *     répété mais sa vignette affiche les logos des sources. »
 *
 * Ses réponses du 17/09/2026 fixent les trois règles que ce module applique :
 *
 *  1. « une autre édition (remaster / Live / Bonus / Delux) est un album à part
 *     entière : chaque version ou édition aura sa propre vignette. » Une même
 *     édition présente dans plusieurs sources = une vignette.
 *  2. Le Focus : « L'indispensable est la source. Après si tu as l'info de la
 *     qualité, tu peux l'ajouter. »
 *  3. « si l'album est dans la bibliothèque alors tu affiches l'album de la
 *     bibliothèque. Si absent de la bibliothèque alors tu affiches l'album
 *     extrait du service connecté (par ordre de préférence : Qobuz, Tidal,
 *     Youtube, Bandcamp) ».
 *
 * ## La clé d'édition : le TITRE replié, et rien d'autre
 *
 * Les services ne servent ni code-barres, ni label, ni type d'album
 * (`StreamAlbum`, `tune-core/src/streaming/traits.rs`) : il n'existe aucun
 * identifiant commun entre une piste de la bibliothèque et un album Qobuz. La
 * seule prise est le titre, sur une page où l'artiste est déjà fixé.
 *
 * C'est aussi ce qui tient la règle 1 sans rien deviner : « Deluxe »,
 * « Remastered », « Live » sont DANS le titre, donc deux éditions ont deux
 * clés. On ne retire volontairement AUCUN suffixe entre parenthèses — le faire
 * fusionnerait précisément ce que Fabien veut séparé.
 *
 * L'ANNÉE n'entre pas dans la clé : un service date souvent la réédition
 * numérique, la bibliothèque la sortie d'origine, et la même édition se
 * retrouverait en deux vignettes.
 */
import type { Album } from './types';
import type { AlbumsDeService } from './albumsArtisteStreaming';
import { compterSources, provenanceDe, sourceCorrespond, type ComptesArtistesSources } from './provenanceBibliotheque';
import { estDuDSD, estMulticanal } from './utils';

/** La bibliothèque, sous le nom que porte déjà sa provenance partout ailleurs. */
export const BIBLIOTHEQUE = 'local';

/**
 * L'ordre de préférence de la règle 3. Un service absent de la liste (Deezer,
 * Amazon, Spotify…) passe après ceux-là, dans l'ordre où il est arrivé.
 */
export const ORDRE_SOURCES: readonly string[] = [BIBLIOTHEQUE, 'qobuz', 'tidal', 'youtube', 'bandcamp'];

/**
 * tune-server-rust#7725 — « DSD » est un palier à part (il était rangé sous
 * Hi-Res), et « Multicanal » un critère indépendant des paliers : un album
 * DSD 5.1 sort sous les deux.
 */
export type Qualite = 'dsd' | 'hires' | 'cd' | 'lossy' | 'multichannel';
export const QUALITES: readonly Qualite[] = ['dsd', 'hires', 'cd', 'lossy', 'multichannel'];

/** Une édition présente dans une source. */
export interface Exemplaire {
  source: string;
  album: Album;
}

/** Une vignette de la grille. */
export interface EntreeDiscographie {
  cle: string;
  /** L'exemplaire qu'on ouvre et qu'on lit — le premier dans `ORDRE_SOURCES`. */
  principal: Exemplaire;
  /** Tous les exemplaires, rangés dans l'ordre de préférence. */
  exemplaires: Exemplaire[];
  /** Les sources, dans le même ordre — ce que la vignette affiche. */
  sources: string[];
  /** Les qualités trouvées parmi les exemplaires, sans doublon. */
  qualites: Qualite[];
  /**
   * tune-server-rust#8662 — TOUTES les éditions de ce titre, y compris celles
   * qu'un même service rend en plusieurs exemplaires (Qobuz : trois éditions
   * de « The Hurting » de Tears For Fears, même titre, même version). Les
   * exemplaires d'abord, dans leur ordre ; puis les autres éditions de chaque
   * source, dans l'ordre d'arrivée. `exemplaires` n'en garde qu'une par
   * source ; rien n'est perdu ici. Voir `editionsCachees`.
   */
  editions: Exemplaire[];
}

/** Le vocabulaire du type explicite (`release_type`, serveur #4767). */
const TYPES_EXPLICITES = new Set(['album', 'ep', 'single', 'broadcast', 'other']);

/**
 * Le type d'un exemplaire : l'explicite (MusicBrainz, service, édition) s'il
 * est reconnu, sinon le type déduit par le serveur d'après les pistes et la
 * durée (#5616). Même ordre que le serveur : l'explicite gagne toujours.
 */
export function typeDeSortie(album: Album): string | undefined {
  const explicite = album.release_type?.trim().toLowerCase();
  if (explicite && TYPES_EXPLICITES.has(explicite)) return explicite;
  return album.inferred_release_type?.trim().toLowerCase() || explicite || undefined;
}

/** Les seuls types que la page peut ranger dans « EP et singles ». */
export function estEpOuSingle(entree: EntreeDiscographie): boolean {
  const types = entree.exemplaires.map((ex) => typeDeSortie(ex.album));
  // Un exemplaire sans type ou contradictoire reste dans la grille Albums.
  return types.length > 0 && types.every((type) => type === 'ep' || type === 'single');
}

/**
 * Le rang de sortie d'une entrée : `single` si TOUS ses exemplaires sont des
 * singles, `ep` si tous sont des EP ou des singles avec au moins un EP (une
 * édition annoncée EP par une source l'emporte sur le single d'une autre),
 * `album` sinon. Décision de Bertrand du 05/10/2026 : deux sections, « EP » et
 * « Singles », au lieu d'« EP & singles » (#5616).
 */
export function rangDeSortie(entree: EntreeDiscographie): 'album' | 'ep' | 'single' {
  if (!estEpOuSingle(entree)) return 'album';
  return entree.exemplaires.every((ex) => typeDeSortie(ex.album) === 'single') ? 'single' : 'ep';
}

/**
 * Section « Live » (Bertrand, 05/10/2026) : une entrée va dans « Live » dès
 * qu'un de ses exemplaires porte le type secondaire `live`
 * (`release_secondary_types`, serveur), QUEL QUE SOIT son type primaire : un EP
 * live est un live. Les services ne publient pas de type secondaire ; leur
 * silence ne contredit donc pas la bibliothèque. Sans type secondaire, le
 * TITRE décide (#6464, voir `titreAnnonceUnLive`).
 */
export function estLive(entree: EntreeDiscographie): boolean {
  const secondaires = entree.exemplaires.map((ex) => ex.album.release_secondary_types ?? []);
  if (secondaires.some((types) => types.some((t) => t?.trim().toLowerCase() === 'live'))) return true;
  // tune-server-rust#6464 — règle PROVISOIRE par le titre, seulement quand
  // aucun exemplaire ne porte de type secondaire : une réponse explicite n'est
  // jamais contredite par le titre. Les services n'en publient pas, d'où la
  // règle (FabienM, fil 2302 point 4).
  if (secondaires.some((types) => types.length > 0)) return false;
  return entree.exemplaires.some((ex) => titreAnnonceUnLive(ex.album.title ?? ''));
}

/** Les mots qui, juste AVANT « live », en font un verbe (« Long Live… », « I Want to Live »). */
const LIVE_VERBE_SI_PRECEDE_DE = new Set([
  'i', 'you', 'we', 'they', 'to', 'will', 'would', 'can', 'could', 'must', 'shall', 'should',
  'long', 'll', 'let', 'gonna', 'wanna', 'might', 'may', 'never', 'still',
]);

/** Les mots qui, juste APRÈS « live », en font un verbe (« Live Through This », « Live and Let Die »). */
const LIVE_VERBE_SI_SUIVI_DE: string[][] = [
  ['through'], ['forever'], ['to'], ['your'], ['my'], ['our'], ['it'], ['with'], ['without'],
  ['like'], ['for'], ['a'], ['again'], ['and', 'let'],
];

/**
 * tune-server-rust#6464 — le titre annonce-t-il un live ? Les MOTS « live » ou
 * « unplugged », pas les lettres (« Alive », « Liverpool » n'y sont pas), et
 * « live » employé comme verbe ne compte pas. Même règle, mot pour mot, que
 * `titre_annonce_un_live` côté serveur (`tune-core/src/metadata/release_type.rs`).
 */
export function titreAnnonceUnLive(titre: string): boolean {
  const mots = titre.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (mots.includes('unplugged')) return true;
  return mots.some((mot, i) => {
    if (mot !== 'live') return false;
    if (i > 0 && LIVE_VERBE_SI_PRECEDE_DE.has(mots[i - 1])) return false;
    const suite = mots.slice(i + 1);
    return !LIVE_VERBE_SI_SUIVI_DE.some((motif) => motif.every((m, k) => suite[k] === m));
  });
}

/** Conserve l'ordre reçu, y compris pour les albums sans type connu. */
export function partagerParTypeDeSortie(entrees: EntreeDiscographie[]) {
  const albums: EntreeDiscographie[] = [];
  const eps: EntreeDiscographie[] = [];
  const singles: EntreeDiscographie[] = [];
  const live: EntreeDiscographie[] = [];
  for (const entree of entrees) {
    if (estLive(entree)) {
      live.push(entree);
      continue;
    }
    const rang = rangDeSortie(entree);
    (rang === 'single' ? singles : rang === 'ep' ? eps : albums).push(entree);
  }
  return { albums, eps, singles, live };
}

/**
 * web#3032 — À PARTIR DE COMBIEN DE VIGNETTES la discographie se range en
 * sections repliables par type (Bertrand, recette du 14/11/2026, page Miles
 * Davis : « beaucoup d'albums, il faudrait faciliter la navigation »). En
 * dessous, la grille reste celle d'avant, telle quelle.
 */
export const SEUIL_SECTIONS_PAR_TYPE = 12;

/** Les sections de #3032, dans l'ordre de la page. */
export const SECTIONS_PAR_TYPE = ['studio', 'live', 'compilations', 'bandes-originales', 'eps', 'singles', 'autres'] as const;
export type SectionParType = (typeof SECTIONS_PAR_TYPE)[number];

/** Les types secondaires d'une entrée, repliés, tous exemplaires réunis. */
function secondairesDe(entree: EntreeDiscographie): string[][] {
  return entree.exemplaires.map((ex) => (ex.album.release_secondary_types ?? []).map((t) => (t ?? '').trim().toLowerCase()));
}

/**
 * web#3032 — l'entrée est-elle une BANDE ORIGINALE ? Le type secondaire
 * MusicBrainz `soundtrack` (balise `RELEASETYPE`, serveur #5616) d'abord. Les
 * services n'en publient pas : sans aucun type secondaire, seules des
 * EXPRESSIONS sans ambiguïté du titre décident (« Original Motion Picture
 * Soundtrack », « Bande originale du film »…) — jamais le mot « soundtrack »
 * seul (« Soundtrack to My Life »), comme `titreAnnonceUnLive` ne lit pas
 * « Alive ».
 */
export function estBandeOriginale(entree: EntreeDiscographie): boolean {
  const secondaires = secondairesDe(entree);
  if (secondaires.some((types) => types.includes('soundtrack'))) return true;
  if (secondaires.some((types) => types.length > 0)) return false;
  return entree.exemplaires.some((ex) => titreAnnonceUneBandeOriginale(ex.album.title ?? ''));
}

/** Les expressions qui, dans un titre, annoncent une bande originale (mots repliés). */
const EXPRESSIONS_BANDE_ORIGINALE: string[][] = [
  ['original', 'soundtrack'],
  ['original', 'motion', 'picture', 'soundtrack'],
  ['motion', 'picture', 'soundtrack'],
  ['original', 'score'],
  ['original', 'film', 'score'],
  ['original', 'motion', 'picture', 'score'],
  ['music', 'from', 'the', 'motion', 'picture'],
  ['bande', 'originale'],
  ['banda', 'sonora', 'original'],
  ['colonna', 'sonora', 'originale'],
];

/** web#3032 — le titre annonce-t-il une bande originale ? Expressions entières seulement. */
export function titreAnnonceUneBandeOriginale(titre: string): boolean {
  const mots = titre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return EXPRESSIONS_BANDE_ORIGINALE.some((expr) =>
    mots.some((_, i) => expr.every((m, k) => mots[i + k] === m)));
}

/**
 * web#3032 — l'entrée est-elle une compilation DE L'ARTISTE (best of,
 * anthologie) ? Le drapeau `is_compilation` de la bibliothèque, ou le type
 * secondaire `compilation`. Les compilations d'AUTRUI où il figure restent
 * sous « Apparaît sur » (serveur #4767) : elles n'arrivent pas ici.
 */
export function estCompilation(entree: EntreeDiscographie): boolean {
  if (entree.exemplaires.some((ex) => ex.album.is_compilation === true)) return true;
  return secondairesDe(entree).some((types) => types.includes('compilation'));
}

/**
 * web#3032 — un type connu ? L'explicite ou le déduit (`typeDeSortie`), ou un
 * type secondaire, sur au moins un exemplaire. Sans rien de tout cela, la
 * vignette va sous « Autres » plutôt que d'être appelée « album studio ».
 */
function typeConnu(entree: EntreeDiscographie): boolean {
  return entree.exemplaires.some((ex) => typeDeSortie(ex.album) !== undefined)
    || secondairesDe(entree).some((types) => types.length > 0);
}

/**
 * web#3032 — LA DISCOGRAPHIE EN SECTIONS PAR TYPE, au-delà de
 * `SEUIL_SECTIONS_PAR_TYPE` vignettes. Une entrée va dans UNE section, la
 * première qui la reconnaît : Live (`estLive`, comme avant), Bande originale,
 * Compilation, puis EP et Singles (`rangDeSortie`, comme avant), Albums
 * studio pour un type connu, Autres sinon. L'ordre reçu (le tri de la page)
 * est conservé dans chaque section.
 */
export function rangerParType(entrees: EntreeDiscographie[]): Record<SectionParType, EntreeDiscographie[]> {
  const sections = Object.fromEntries(SECTIONS_PAR_TYPE.map((s) => [s, [] as EntreeDiscographie[]])) as Record<SectionParType, EntreeDiscographie[]>;
  for (const entree of entrees) {
    let section: SectionParType;
    if (estLive(entree)) section = 'live';
    else if (estBandeOriginale(entree)) section = 'bandes-originales';
    else if (estCompilation(entree)) section = 'compilations';
    else {
      const r = rangDeSortie(entree);
      section = r === 'ep' ? 'eps' : r === 'single' ? 'singles' : typeConnu(entree) ? 'studio' : 'autres';
    }
    sections[section].push(entree);
  }
  return sections;
}

/**
 * Le titre replié : sans accents, sans casse, sans ponctuation.
 *
 * « C’est déjà ça » (apostrophe typographique chez un service) et « C'est deja
 * ca » (tags d'un rip) sont la même édition. Rien n'est RETIRÉ du titre hormis
 * la ponctuation : voir l'en-tête pour les suffixes d'édition.
 */
export function cleEdition(titre: string | null | undefined): string {
  return (titre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const RANG_INCONNU = ORDRE_SOURCES.length;
const rang = (source: string) => {
  const i = ORDRE_SOURCES.indexOf(source);
  return i === -1 ? RANG_INCONNU : i;
};

const SANS_PERTE = new Set(['flac', 'alac', 'wav', 'aiff', 'aif', 'ape', 'wv', 'wavpack', 'dsf', 'dff', 'dsd']);
const AVEC_PERTE = new Set(['mp3', 'aac', 'm4a', 'ogg', 'vorbis', 'opus', 'wma', 'mp4a']);

/**
 * La qualité d'un exemplaire, ou `null` quand rien ne permet de la dire.
 *
 * Deux formes à lire. La bibliothèque sert `sample_rate`, `bit_depth` et
 * `format` à plat. Un service sert un OBJET `quality: { codec, sample_rate,
 * bit_depth }` — le type client le déclare en chaîne, mais c'est la forme
 * sérialisée de `StreamQuality`. On lit les deux.
 *
 * YouTube ne sert rien de tel et n'est jamais sans perte : il est classé
 * compressé d'office plutôt que laissé inconnu.
 */
export function qualiteDe(ex: Exemplaire): Qualite | null {
  const al = ex.album as Album & { quality?: unknown };
  const q = al.quality && typeof al.quality === 'object'
    ? (al.quality as { codec?: string; sample_rate?: number; bit_depth?: number })
    : null;
  const bits = Number(al.bit_depth ?? q?.bit_depth ?? 0);
  const freq = Number(al.sample_rate ?? q?.sample_rate ?? 0);
  const codec = String(al.format ?? q?.codec ?? '').toLowerCase();

  if (ex.source === 'youtube') return 'lossy';
  if (AVEC_PERTE.has(codec)) return 'lossy';
  if (estDuDSD(codec)) return 'dsd';
  if (bits > 16 || freq > 48000) return 'hires';
  if (bits === 16 || SANS_PERTE.has(codec)) return 'cd';
  return null;
}

/**
 * La résolution d'un exemplaire, telle qu'on l'écrit sur une étiquette :
 * « 24/96 », « 16/44.1 » (bits / kHz), « DSD » — ou `null` quand le service ne
 * la dit pas (Spotify, Deezer…) : on n'affiche pas ce qu'on ne sait pas.
 * Mêmes champs que `qualiteDe`, sous ses deux formes.
 */
export function resolutionDe(ex: Exemplaire): string | null {
  const al = ex.album as Album & { quality?: unknown };
  const q = al.quality && typeof al.quality === 'object'
    ? (al.quality as { codec?: string; sample_rate?: number; bit_depth?: number })
    : null;
  const bits = Number(al.bit_depth ?? q?.bit_depth ?? 0);
  const freq = Number(al.sample_rate ?? q?.sample_rate ?? 0);
  const codec = String(al.format ?? q?.codec ?? '').toLowerCase();
  if (estDuDSD(codec)) return 'DSD';
  if (!(bits > 0) || !(freq > 0)) return null;
  const khz = freq >= 1000 ? freq / 1000 : freq;
  return `${bits}/${Number.isInteger(khz) ? khz : khz.toFixed(1)}`;
}

/** Une étiquette de vignette : la plateforme, et ce qu'elle sert (#2829). */
export interface VersionSource {
  source: string;
  qualite: Qualite | null;
  resolution: string | null;
}

const RANG_QUALITE: Record<Qualite, number> = { dsd: 4, hires: 3, cd: 2, lossy: 1, multichannel: 0 };
const debitDe = (ex: Exemplaire) => {
  const al = ex.album as Album & { quality?: unknown };
  const q = al.quality && typeof al.quality === 'object'
    ? (al.quality as { sample_rate?: number; bit_depth?: number })
    : null;
  return Number(al.bit_depth ?? q?.bit_depth ?? 0) * Number(al.sample_rate ?? q?.sample_rate ?? 0);
};

/**
 * LES ÉTIQUETTES D'UNE VIGNETTE — tune-web-client#2829 (Ronin22, ASR #169).
 *
 * Un album présent chez plusieurs services est UNE vignette (#4330) ; elle
 * dit, pour chaque plateforme, la résolution qu'on y trouve. Une plateforme =
 * une étiquette, dans l'ordre de la vignette (`e.sources`) ; quand une source
 * tient plusieurs exemplaires (local et serveur UPnP sous « bibliothèque »),
 * l'étiquette porte le meilleur.
 */
export function versionsEntree(e: EntreeDiscographie): VersionSource[] {
  return e.sources.map((source) => {
    const exs = e.exemplaires.filter((x) => x.source === source);
    let meilleur: Exemplaire | null = null;
    let rangMeilleur = -1;
    for (const ex of exs) {
      const q = qualiteDe(ex);
      const r = (q ? RANG_QUALITE[q] : 0) * 1e9 + debitDe(ex);
      if (r > rangMeilleur) { rangMeilleur = r; meilleur = ex; }
    }
    return {
      source,
      qualite: meilleur ? qualiteDe(meilleur) : null,
      resolution: meilleur ? resolutionDe(meilleur) : null,
    };
  });
}

/**
 * tune-server-rust#8662 — la vignette cache-t-elle des éditions ? Vrai quand
 * une source y tient plus d'un exemplaire : c'est alors que le badge
 * « N éditions » s'affiche. Un album présent chez Qobuz et dans la
 * bibliothèque n'a qu'une édition par source : pas de badge, ses étiquettes
 * de plateforme (#2829) le disent déjà.
 */
export function editionsCachees(e: EntreeDiscographie): boolean {
  return (e.editions?.length ?? 0) > e.exemplaires.length;
}

/** Ce que la liste des éditions dit de chacune (#8662). */
export interface DetailEdition {
  source: string;
  titre: string;
  qualite: Qualite | null;
  resolution: string | null;
  /** « 1983-03-07 » quand la date est connue, sinon l'année, sinon `null`. */
  date: string | null;
  pistes: number | null;
  label: string | null;
}

/**
 * Le détail d'une édition : qualité, date de sortie, nombre de titres, label.
 * Ce que le service ne dit pas reste `null` — on n'affiche pas ce qu'on ne
 * sait pas. Qobuz date ses albums par `released_at` (secondes d'époque).
 */
export function detailEdition(ex: Exemplaire): DetailEdition {
  const al = ex.album as Album & { released_at?: number | null };
  let date: string | null = al.release_date?.trim() ? al.release_date.trim().slice(0, 10) : null;
  if (!date && typeof al.released_at === 'number' && Number.isFinite(al.released_at) && al.released_at > 0) {
    date = new Date(al.released_at * 1000).toISOString().slice(0, 10);
  }
  if (!date && al.year) date = String(al.year);
  const pistes = Number(al.track_count ?? 0);
  return {
    source: ex.source,
    titre: al.title ?? '',
    qualite: qualiteDe(ex),
    resolution: resolutionDe(ex),
    date,
    pistes: pistes > 0 ? pistes : null,
    label: al.label?.trim() || null,
  };
}

/**
 * L'exemplaire relève-t-il de cette qualité ? Multicanal se lit à part
 * (`max_channels`, servi par la bibliothèque seulement), les paliers par
 * `qualiteDe`.
 */
export function aLaQualite(ex: Exemplaire, q: Qualite): boolean {
  return q === 'multichannel' ? estMulticanal(ex.album) : qualiteDe(ex) === q;
}

/**
 * Fusionne la bibliothèque et les services en une liste de vignettes.
 *
 * L'ordre de SORTIE suit la première apparition de chaque édition (la
 * bibliothèque d'abord) ; le tri visible est l'affaire de l'écran.
 *
 * 🔴 Un même service rend parfois DEUX fois la même édition sous deux
 * identifiants (Qobuz, rééditions de catalogue). On garde UN exemplaire par
 * source : deux pastilles « QOBUZ » sur une vignette ne diraient rien de plus.
 *
 * 🔴 Les autres ne sont pas JETÉS (#8662, Simon, fil 2795 : « Tears For
 * Fears only shows one version of The Hurting ») : ils restent des éditions
 * de la vignette (`editions`), proposées par le badge « N éditions ». Une
 * vignette, aucun doublon visible, et chaque édition s'ouvre et se lit.
 *
 * 🔴 Lequel : celui qui a le PLUS de titres, pas le premier arrivé. Neil
 * Young, « Second Song » (#4652, fil 1875) : Qobuz rend le single d'avant-
 * sortie (1 titre, rang 61) avant l'album (7 titres, rang 89), même titre. Le
 * premier arrivé gagnait, et l'album n'était plus atteignable depuis la page.
 *
 * 🔴 Cette règle ne vaut PAS pour la bibliothèque. Genesis sur le .18
 * (Bertrand, 12/10/2026, rc4) : « A TRICK OF THE TAIL » d'un serveur UPnP
 * (8 titres, rendu en premier), puis deux éditions locales, 1981 (7 titres)
 * et 2007 (8 titres). Les trois passaient pour la source « local » : l'UPnP
 * gardait la place, et sous la pastille « Local » la vignette — de provenance
 * `upnp:<udn>` — tombait avec les deux albums locaux. Un album de la
 * bibliothèque est un enregistrement à part entière : il n'en écarte jamais
 * un autre. Deux albums de la bibliothèque se partagent une vignette s'ils
 * viennent de provenances DIFFÉRENTES (local et un serveur UPnP) ; de la même
 * provenance, le second a sa propre vignette.
 */
export function fusionnerDiscographie(
  locaux: Album[] | null | undefined,
  services: AlbumsDeService[] | null | undefined,
): EntreeDiscographie[] {
  const parCle = new Map<string, Exemplaire[]>();
  /** #8662 — les exemplaires d'un service écartés par la règle de #4652. */
  const autresParCle = new Map<string, Exemplaire[]>();
  const ajouterBibliotheque = (album: Album) => {
    const cle = cleEdition(album?.title);
    if (!cle) return ajouter(BIBLIOTHEQUE, album);
    const p = provenanceDe(album);
    // La première vignette de ce titre qui n'a pas encore d'exemplaire de
    // cette provenance ; sinon une vignette à elle, sous une clé dérivée.
    for (let n = 1; ; n++) {
      const k = n === 1 ? cle : `${cle}#${n}`;
      const liste = parCle.get(k);
      if (!liste) { parCle.set(k, [{ source: BIBLIOTHEQUE, album }]); return; }
      if (!liste.some((e) => e.source === BIBLIOTHEQUE && provenanceDe(e.album) === p)) {
        liste.push({ source: BIBLIOTHEQUE, album });
        return;
      }
    }
  };
  const ajouter = (source: string, album: Album) => {
    const cle = cleEdition(album?.title);
    // Un album sans titre ne se rapproche de rien : il garde sa vignette, sous
    // une clé qui ne peut rencontrer aucune autre.
    const k = cle || `∅:${source}:${String(album?.id ?? album?.source_id ?? parCle.size)}`;
    const liste = parCle.get(k) ?? [];
    const deja = cle ? liste.findIndex((e) => e.source === source) : -1;
    const ex: Exemplaire = { source, album };
    // #8662 — l'exemplaire écarté reste une ÉDITION de la vignette.
    const autres = autresParCle.get(k) ?? [];
    if (deja > -1) {
      if (Number(album?.track_count ?? 0) > Number(liste[deja].album?.track_count ?? 0)) {
        autres.push(liste[deja]);
        liste[deja] = ex;
      } else {
        autres.push(ex);
      }
      autresParCle.set(k, autres);
      return;
    }
    liste.push(ex);
    parCle.set(k, liste);
  };

  for (const al of locaux ?? []) ajouterBibliotheque(al);
  for (const sec of services ?? []) {
    for (const al of sec.albums ?? []) ajouter(sec.service, al);
  }

  // Dans la bibliothèque, le local passe avant un serveur UPnP (règle 3).
  const rangExemplaire = (e: Exemplaire) =>
    e.source === BIBLIOTHEQUE ? rangProvenance(provenanceDe(e.album)) : rang(e.source);
  return [...parCle.entries()].map(([cle, exemplaires]) => {
    const ranges = exemplaires
      .map((e, i) => ({ e, i }))
      .sort((a, b) => rangExemplaire(a.e) - rangExemplaire(b.e) || a.i - b.i)
      .map(({ e }) => e);
    const qualites = QUALITES.filter((q) => ranges.some((e) => aLaQualite(e, q)));
    return {
      cle,
      principal: ranges[0],
      exemplaires: ranges,
      // Local et UPnP partagent la pastille « bibliothèque » : une seule fois.
      sources: [...new Set(ranges.map((e) => e.source))],
      qualites,
      editions: [...ranges, ...(autresParCle.get(cle) ?? [])
        .map((e, i) => ({ e, i }))
        .sort((a, b) => rangExemplaire(a.e) - rangExemplaire(b.e) || a.i - b.i)
        .map(({ e }) => e)],
    };
  });
}

/**
 * LE MENU « SOURCE » DE LA BIBLIOTHÈQUE, fiche artiste ouverte.
 *
 * Bertrand, capture du .18 le 17/09/2026 : « Source affiche des chiffres faux
 * et pas les services de streaming ». Le menu comptait la grille des ARTISTES
 * (bibliothèque seule) pendant que la fiche montrait 44 albums de cinq sources.
 *
 * Les provenances d'une vignette parlent la langue de ce menu : un exemplaire
 * de bibliothèque vaut `provenanceDe` (`local`, ou `upnp:<udn>` pour un serveur
 * du réseau intégré), un exemplaire de service vaut le nom du service.
 */
export function provenancesEntree(e: EntreeDiscographie): string[] {
  return e.exemplaires.map((x) => (x.source === BIBLIOTHEQUE ? provenanceDe(x.album) : x.source));
}

/** Une vignette passe le filtre si UN de ses exemplaires vient de la source. */
export function dansProvenance(e: EntreeDiscographie, filtre: string | null): boolean {
  return filtre == null || provenancesEntree(e).some((s) => sourceCorrespond(s, filtre));
}

/** Les comptes du menu, sur la discographie ENTIÈRE — une vignette à deux
 *  sources compte pour chacune, et une seule fois dans le total. */
export function comptesProvenanceFiche(entrees: EntreeDiscographie[]): ComptesArtistesSources {
  return { comptes: compterSources(entrees.map(provenancesEntree)), total: entrees.length };
}

/**
 * LES PASTILLES « SOURCE » DE LA FICHE — Bertrand, 28/09/2026 : « Dans la
 * fiche artiste, je veux ajouter un filtre par source (local, upnp, Qobuz…) ».
 *
 * Le filtre existait, replié dans le Focus, et parlait la langue de la FUSION :
 * une case « Bibliothèque » pour le local ET tous les serveurs UPnP. Les
 * pastilles parlent celle du menu « Source » de la Bibliothèque — `local`,
 * `upnp:<udn>` par serveur, puis chaque service — pour que la source choisie
 * dans la grille soit une pastille comme les autres, visible et décochable.
 *
 * Arbitrages du 28/09/2026 : plusieurs sources à la fois (OU), et le filtre
 * porte sur TOUTES les sections de la fiche, pas la seule discographie.
 */
export interface CompteProvenance {
  cle: string;
  n: number;
}

/** Local d'abord, puis les serveurs UPnP, puis les services dans l'ordre de la règle 3. */
const rangProvenance = (cle: string) => (cle.startsWith('upnp') ? 0.5 : rang(cle));

/**
 * Les pastilles à montrer, comptées sur toutes les sections réunies : une
 * vignette à deux sources compte pour chacune, une vignette présente dans deux
 * sections compte deux fois — c'est ce que la fiche affiche.
 *
 * Seules les provenances PRÉSENTES sont rendues, comme au Focus.
 */
export function compterProvenances(sections: readonly (readonly EntreeDiscographie[])[]): CompteProvenance[] {
  const comptes = new Map<string, number>();
  for (const entrees of sections) {
    for (const e of entrees) {
      for (const cle of new Set(provenancesEntree(e))) comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
    }
  }
  return [...comptes.entries()]
    .map(([cle, n]) => ({ cle, n }))
    .sort((a, b) => rangProvenance(a.cle) - rangProvenance(b.cle) || a.cle.localeCompare(b.cle));
}

/**
 * Le choix courant couvre-t-il cette pastille ? Le choix peut porter `upnp`
 * tout court — la grille de la Bibliothèque sait le poser — qui couvre chacun
 * de ses serveurs.
 */
export function provenanceCochee(cle: string, choix: ReadonlySet<string>): boolean {
  return [...choix].some((c) => sourceCorrespond(cle, c));
}

/** Rien de coché = tout ; sinon UN exemplaire d'une source cochée suffit. */
export function dansProvenances(e: EntreeDiscographie, choix: ReadonlySet<string>): boolean {
  return choix.size === 0 || provenancesEntree(e).some((s) => provenanceCochee(s, choix));
}

/**
 * L'exemplaire qu'une vignette ouvre et lit SOUS LE FILTRE — Bertrand et Yves
 * Corbat, 30/09/2026, v0.9.168 : « dans la fiche artiste, si on choisit Qobuz
 * comme source des albums puis qu'on clique sur un album, c'est l'album LOCAL
 * qui s'ouvre ». `dansProvenances` garde la vignette parce qu'UN exemplaire
 * vient de Qobuz, mais le principal restait le premier de `ORDRE_SOURCES` —
 * la bibliothèque — et le clic, la lecture, la pochette et le menu partaient
 * sur lui.
 *
 * Le principal reste celui de la règle 3 quand rien n'est coché ou quand sa
 * provenance est cochée ; sinon, c'est le premier exemplaire (dans l'ordre de
 * préférence) d'une provenance cochée. La vignette est RENDUE neuve, jamais
 * modifiée : les entrées fusionnées servent à toutes les sections.
 */
export function recentrerSurProvenances(e: EntreeDiscographie, choix: ReadonlySet<string>): EntreeDiscographie {
  if (choix.size === 0) return e;
  const coche = (x: Exemplaire) => provenanceCochee(x.source === BIBLIOTHEQUE ? provenanceDe(x.album) : x.source, choix);
  if (coche(e.principal)) return e;
  const retenu = e.exemplaires.find(coche);
  return retenu ? { ...e, principal: retenu } : e;
}

/**
 * Coche ou décoche UNE pastille. Le choix est d'abord ramené aux pastilles
 * présentes : décocher « Sonos » sous un `upnp` venu de la grille doit laisser
 * les autres serveurs cochés, pas tout effacer ni rien changer.
 */
export function basculerProvenance(choix: ReadonlySet<string>, cle: string, presentes: readonly string[]): Set<string> {
  const n = new Set(presentes.filter((p) => provenanceCochee(p, choix)));
  if (n.has(cle)) n.delete(cle); else n.add(cle);
  return n;
}

/**
 * LE FILTRE « SOURCE » RETENU — #1874 (Levente Toth, fil 2103, 1.0.0-rc1).
 *
 * « Or could be also a option that the last state is saved, eg. if the Local
 * is selected, that will be the default and it's not jumping back to All. »
 *
 * Le choix des pastilles vivait dans la grille : chaque fiche repartait de
 * « Toutes ». Il est retenu comme le tri (`v2.art.albums.tri`) : une
 * préférence d'affichage, globale à toutes les fiches artiste, dans le
 * navigateur (`preferencesEcran`).
 */
export const CLE_SOURCE_FICHE = 'v2.art.disco.source';

/** Le choix en texte : un tableau JSON trié, `[]` pour « Toutes ». */
export function serialiserSource(choix: ReadonlySet<string>): string {
  return JSON.stringify([...choix].sort());
}

/**
 * Le choix relu. Tout ce qui n'est pas un tableau de clés non vides (texte
 * illisible, valeur d'une autre version) rend « Toutes » : un filtre qu'on ne
 * sait pas relire ne doit pas vider la fiche.
 */
export function relireSource(texte: string | null | undefined): Set<string> {
  if (!texte) return new Set();
  try {
    const v = JSON.parse(texte);
    if (!Array.isArray(v) || v.length > 32) return new Set();
    return new Set(v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= 200));
  } catch {
    return new Set();
  }
}

/**
 * Le choix qui S'APPLIQUE à cette fiche : le choix retenu, ramené aux
 * pastilles présentes.
 *
 * 🔴 Un choix retenu dont aucune pastille n'est là vaut « Toutes », sans être
 * oublié : « Local » retenu sur un artiste que la bibliothèque ne connaît pas
 * ne doit pas rendre une fiche vide, et une pastille YouTube retenue s'applique
 * dès que YouTube a répondu — les pastilles arrivent avec les services.
 */
export function choixEffectif(choix: ReadonlySet<string>, presentes: readonly string[]): Set<string> {
  if (choix.size === 0) return new Set();
  return new Set(presentes.filter((p) => provenanceCochee(p, choix)));
}

/** Ce que le Focus retient. Un ensemble vide = pas de filtre sur cet axe. */
export interface Focus {
  sources: Set<string>;
  qualites: Set<Qualite>;
}

/**
 * OU à l'intérieur d'un axe, ET entre les axes — la lecture du panneau de
 * Roon : « Qobuz + Local » montre l'un ou l'autre, « Local » et « Hi-Res »
 * montre ce qui est les deux.
 */
export function filtrerFocus(entrees: EntreeDiscographie[], focus: Focus): EntreeDiscographie[] {
  return entrees.filter(
    (e) =>
      (focus.sources.size === 0 || e.sources.some((s) => focus.sources.has(s))) &&
      (focus.qualites.size === 0 || e.qualites.some((q) => focus.qualites.has(q))),
  );
}

export interface ComptesFocus {
  sources: { source: string; n: number }[];
  qualites: { qualite: Qualite; n: number }[];
}

/**
 * Les compteurs du panneau, sur la discographie ENTIÈRE et non sur la vue
 * filtrée : un compteur qui tombe à zéro dès qu'on coche une case ne dit plus
 * ce qu'on obtiendrait en la décochant.
 *
 * Seules les valeurs PRÉSENTES sont rendues : une case « Tidal (0) » ne se
 * coche pour rien.
 */
export function compterFocus(entrees: EntreeDiscographie[]): ComptesFocus {
  const src = new Map<string, number>();
  for (const e of entrees) for (const s of e.sources) src.set(s, (src.get(s) ?? 0) + 1);
  return {
    sources: [...src.entries()]
      .map(([source, n]) => ({ source, n }))
      .sort((a, b) => rang(a.source) - rang(b.source)),
    qualites: QUALITES
      .map((qualite) => ({ qualite, n: entrees.filter((e) => e.qualites.includes(qualite)).length }))
      .filter((c) => c.n > 0),
  };
}
