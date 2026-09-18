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

/** La bibliothèque, sous le nom que porte déjà sa provenance partout ailleurs. */
export const BIBLIOTHEQUE = 'local';

/**
 * L'ordre de préférence de la règle 3. Un service absent de la liste (Deezer,
 * Amazon, Spotify…) passe après ceux-là, dans l'ordre où il est arrivé.
 */
export const ORDRE_SOURCES: readonly string[] = [BIBLIOTHEQUE, 'qobuz', 'tidal', 'youtube', 'bandcamp'];

export type Qualite = 'hires' | 'cd' | 'lossy';
export const QUALITES: readonly Qualite[] = ['hires', 'cd', 'lossy'];

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
  if (bits > 16 || freq > 48000 || codec.startsWith('dsd') || codec === 'dsf' || codec === 'dff') return 'hires';
  if (bits === 16 || SANS_PERTE.has(codec)) return 'cd';
  return null;
}

/**
 * Fusionne la bibliothèque et les services en une liste de vignettes.
 *
 * L'ordre de SORTIE suit la première apparition de chaque édition (la
 * bibliothèque d'abord) ; le tri visible est l'affaire de l'écran.
 *
 * 🔴 Un même service rend parfois DEUX fois la même édition sous deux
 * identifiants (Qobuz, rééditions de catalogue). On garde le premier
 * exemplaire par source : deux pastilles « QOBUZ » sur une vignette ne
 * diraient rien de plus.
 */
export function fusionnerDiscographie(
  locaux: Album[] | null | undefined,
  services: AlbumsDeService[] | null | undefined,
): EntreeDiscographie[] {
  const parCle = new Map<string, Exemplaire[]>();
  const ajouter = (source: string, album: Album) => {
    const cle = cleEdition(album?.title);
    // Un album sans titre ne se rapproche de rien : il garde sa vignette, sous
    // une clé qui ne peut rencontrer aucune autre.
    const k = cle || `∅:${source}:${String(album?.id ?? album?.source_id ?? parCle.size)}`;
    const liste = parCle.get(k) ?? [];
    if (liste.some((e) => e.source === source) && cle) return;
    liste.push({ source, album });
    parCle.set(k, liste);
  };

  for (const al of locaux ?? []) ajouter(BIBLIOTHEQUE, al);
  for (const sec of services ?? []) {
    for (const al of sec.albums ?? []) ajouter(sec.service, al);
  }

  return [...parCle.entries()].map(([cle, exemplaires]) => {
    const ranges = exemplaires
      .map((e, i) => ({ e, i }))
      .sort((a, b) => rang(a.e.source) - rang(b.e.source) || a.i - b.i)
      .map(({ e }) => e);
    const qualites = QUALITES.filter((q) => ranges.some((e) => qualiteDe(e) === q));
    return {
      cle,
      principal: ranges[0],
      exemplaires: ranges,
      sources: ranges.map((e) => e.source),
      qualites,
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
