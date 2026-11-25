import type { TrackCredit } from '../types';

/**
 * Group a flat list of track credits by their `role` (defaulting to
 * `performer` when a credit carries no role), preserving insertion order
 * within each group. Extracted from LibraryView so it can be unit-tested and
 * reused by the credits UI without pulling in the whole component.
 */
export function groupCreditsByRole(credits: TrackCredit[]): Record<string, TrackCredit[]> {
  const groups: Record<string, TrackCredit[]> = {};
  for (const c of credits) {
    const role = c.role || 'performer';
    if (!groups[role]) groups[role] = [];
    groups[role].push(c);
  }
  return groups;
}

/**
 * The distinct, alphabetically sorted set of instruments mentioned across a
 * track's credits (credits without an instrument are ignored).
 */
export function uniqueInstruments(credits: TrackCredit[], langue?: string): string[] {
  const set = new Set<string>();
  for (const c of credits) {
    if (c.instrument) set.add(c.instrument);
  }
  // Ordre alphabétique de la LANGUE (« violoncelle » après « violon », « é »
  // avec « e ») : `.sort()` seul range par points de code, majuscules d'abord.
  return [...set].sort((a, b) => comparerInstruments(a, b, langue));
}

/** Compare deux instruments selon la langue, sans tenir compte de la casse. */
export function comparerInstruments(a: string, b: string, langue?: string): number {
  return a.localeCompare(b, langue, { sensitivity: 'base' }) || a.localeCompare(b, langue);
}

/**
 * La clé d'un nom de personne : décomposé (NFKD), sans diacritiques, en
 * minuscules, espaces resserrés. « Beyoncé », « beyonce » et « Beyonce  »
 * donnent la même clé.
 */
export function normaliserNom(nom: string): string {
  return nom.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/* ══════════════════════════════════════════════════════════════════════════
   #1572 — « Voir les crédits » (FabienM, fil forum 1921, sur le modèle de
   Roon). Ce qui suit était LOCAL à `NowPlaying.svelte` (ordre des rôles,
   dédoublonnage) : la fiche de crédits d'un titre ou d'un album en a besoin
   aussi, et deux copies de l'ordre auraient divergé au premier rôle ajouté.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ordre d'affichage des rôles : l'écriture en tête, les interprètes au milieu,
 * la technique à la fin. Un rôle absent d'ici suit, par ordre alphabétique.
 * Les rôles sont ceux qu'écrit le serveur (`role_canonique`, #4862 :
 * `writer` pour parolier, `vocal`, `mastering`…) et ceux des étiquettes du
 * fichier (`lyricist`).
 */
export const ORDRE_DES_ROLES = [
  'composer', 'composer_writer', 'writer', 'lyricist', 'arranger', 'conductor',
  'artist', 'performer', 'vocal',
  'producer', 'mixer', 'remixer', 'engineer', 'mastering', 'programming',
];

function rangDuRole(role: string): number {
  const i = ORDRE_DES_ROLES.indexOf(role);
  return i === -1 ? ORDRE_DES_ROLES.length : i;
}

function comparerRoles(a: string, b: string): number {
  return rangDuRole(a) - rangDuRole(b) || a.localeCompare(b);
}

/**
 * Dédoublonne par (artiste, rôle, instrument) : l'enrichissement MusicBrainz
 * peut rendre deux fois le même triplet quand deux identifiants de la piste
 * désignent la même relation.
 */
export function dedupCredits<T extends TrackCredit>(credits: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of credits) {
    const key = `${c.artist_id ?? c.artist_name}|${c.role}|${c.instrument ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Les crédits groupés par rôle, dans `ORDRE_DES_ROLES`. */
export function sortedRoleEntries(credits: TrackCredit[]): [string, TrackCredit[]][] {
  const groups = groupCreditsByRole(dedupCredits(credits));
  return Object.entries(groups).sort(([a], [b]) => comparerRoles(a, b));
}

/**
 * Le libellé d'un rôle : sa clé `credits.<rôle>` quand la langue l'a, sinon
 * le rôle brut, capitalisé.
 */
export function libelleRole(role: string, traduire: (cle: string) => string): string {
  // Un rôle absent ne doit rien faire lever : ce libellé est lu dans le rendu
  // de « Lecture en cours », où une exception fige l'écran (fil 3031).
  role = role || 'performer';
  const cle = `credits.${role}`;
  const traduit = traduire(cle);
  if (traduit && traduit !== cle) return traduit;
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * Une ligne de crédit, et la piste qu'elle concerne quand la route la donne.
 *
 * `track_id` : l'`i64` de `tracks` pour la bibliothèque, la CHAÎNE du service
 * pour un titre de service (#4993 — `GET /streaming/{service}/…/credits`).
 */
export interface CreditAvecPiste extends Omit<TrackCredit, 'track_id'> {
  track_id: number | string | null;
  track_title?: string | null;
  track_number?: number | null;
  disc_number?: number | null;
  artist_mbid?: string | null;
  /**
   * #4805 lot 1 (d'après MetaRust, de Xavier Joly) — les instruments que la
   * fiche WIKIDATA de l'artiste lui attribue, quand MusicBrainz l'a crédité
   * sans instrument. Ce sont ceux de l'artiste, pas la preuve qu'il en joue
   * sur ce disque : l'écran les marque « d'après Wikidata ».
   */
  instruments_wikidata?: InstrumentWikidata[] | null;
}

/** Un instrument de la fiche Wikidata d'un artiste (`artiste_instruments`). */
export interface InstrumentWikidata {
  qid: string;
  fr?: string | null;
  en?: string | null;
  canon?: string | null;
}

/** Le libellé d'un instrument Wikidata dans la langue de l'interface :
 *  le français en français, l'anglais partout ailleurs, l'autre à défaut. */
export function libelleInstrumentWikidata(i: InstrumentWikidata, langue: string): string {
  const fr = i.fr?.trim() || null;
  const en = i.en?.trim() || null;
  return (langue === 'fr' ? fr ?? en : en ?? fr) ?? i.qid;
}

/** Les deux blocs de la fiche de Roon, plus un bloc pour l'inconnu. */
export type FamilleCredits = 'interpretes' | 'production' | 'autres';

const FAMILLE: Record<string, FamilleCredits> = {
  composer: 'interpretes', composer_writer: 'interpretes', writer: 'interpretes', lyricist: 'interpretes',
  arranger: 'interpretes', conductor: 'interpretes', artist: 'interpretes',
  performer: 'interpretes', vocal: 'interpretes',
  producer: 'production', mixer: 'production', remixer: 'production',
  engineer: 'production', mastering: 'production', programming: 'production',
};

export function familleDuRole(role: string): FamilleCredits {
  return FAMILLE[role] ?? 'autres';
}

export interface PisteCitee {
  /** Nombre (bibliothèque) ou chaîne (service, #4993). */
  track_id: number | string;
  numero: number | null;
  disque: number | null;
  titre: string | null;
}

export interface ArtisteCredite {
  artist_id: number | null;
  artist_name: string;
  /** Instruments d'après Wikidata (#4805 lot 1), sans doublon. */
  instrumentsWikidata?: InstrumentWikidata[];
  /** Les pistes où il figure à ce titre — vide pour la fiche d'une piste. */
  pistes: PisteCitee[];
}

export interface LigneCredits {
  role: string;
  instrument: string | null;
  artistes: ArtisteCredite[];
}

export interface BlocCredits {
  famille: FamilleCredits;
  lignes: LigneCredits[];
}

const ORDRE_DES_FAMILLES: FamilleCredits[] = ['interpretes', 'production', 'autres'];

/**
 * La fiche : des blocs (interprètes, production, autres), dans chaque bloc
 * une ligne par rôle — et par instrument, comme « Violoncelle » chez Roon —,
 * dans chaque ligne un artiste par nom, avec les pistes où il figure.
 *
 * Pour un titre, chaque artiste n'a qu'une piste, qu'on n'affiche pas ; pour
 * un album, la même personne créditée sur six pistes n'apparaît qu'UNE fois,
 * suivie de ses numéros.
 */
export function blocsDeCredits(credits: CreditAvecPiste[], langue?: string): BlocCredits[] {
  // Deux relevés préalables, par piste : qui joue d'un instrument précis, qui
  // compose. Ils décident des doublons à écarter plus bas.
  const instrumentistes = new Map<string, Personne[]>();
  const compositeurs = new Map<string, Personne[]>();
  const auteurs = new Map<string, Personne[]>();
  for (const c of credits) {
    const p = personneDu(c);
    if (!p) continue;
    const role = c.role || 'performer';
    if (c.instrument?.trim()) ajouterPersonne(instrumentistes, clePiste(c), p);
    if (role === 'composer') ajouterPersonne(compositeurs, clePiste(c), p);
    if (ROLES_D_AUTEUR.has(role)) ajouterPersonne(auteurs, clePiste(c), p);
  }

  const lignes = new Map<string, LigneCredits>();
  for (const c of credits) {
    let role = c.role || 'performer';
    const instrument = c.instrument?.trim() || null;
    const p = personneDu(c);
    if (p) {
      // (a) Rangé sous son instrument, un musicien ne se répète pas sous le
      // rôle générique « Musicien » de la même piste.
      if (!instrument && ROLES_GENERIQUES_D_INTERPRETE.has(role)
        && (instrumentistes.get(clePiste(c)) ?? []).some((x) => memePersonne(x, p))) continue;
      // (b) Un compositeur ne se répète pas comme auteur de la même piste :
      // sa ligne devient « Compositeur et parolier », et rien ne se perd.
      // Un parolier DISTINCT (une autre personne) garde sa ligne.
      if (ROLES_D_AUTEUR.has(role)
        && (compositeurs.get(clePiste(c)) ?? []).some((x) => memePersonne(x, p))) continue;
      if (role === 'composer'
        && (auteurs.get(clePiste(c)) ?? []).some((x) => memePersonne(x, p))) role = 'composer_writer';
    }
    const cleLigne = `${role}|${normaliserNom(instrument ?? '')}`;
    let ligne = lignes.get(cleLigne);
    if (!ligne) {
      ligne = { role, instrument, artistes: [] };
      lignes.set(cleLigne, ligne);
    }
    if (!p) continue;
    // (c) Une personne une fois par ligne, malgré accents, casse et espaces.
    let artiste = ligne.artistes.find((a) => memePersonne(personneDeLArtiste(a), p));
    if (!artiste) {
      artiste = { artist_id: c.artist_id ?? null, artist_name: p.nom, pistes: [] };
      ligne.artistes.push(artiste);
    } else {
      if (artiste.artist_id == null && c.artist_id != null) artiste.artist_id = c.artist_id;
      if (graphiePlusComplete(p.nom, artiste.artist_name)) artiste.artist_name = p.nom;
    }
    if (p.mbid) mbidDesArtistes.set(artiste, p.mbid);
    for (const i of c.instruments_wikidata ?? []) {
      artiste.instrumentsWikidata ??= [];
      if (!artiste.instrumentsWikidata.some((x) => x.qid === i.qid)) artiste.instrumentsWikidata.push(i);
    }
    if (c.track_id != null && !artiste.pistes.some((x) => x.track_id === c.track_id)) {
      artiste.pistes.push({
        track_id: c.track_id,
        numero: c.track_number ?? null,
        disque: c.disc_number ?? null,
        titre: c.track_title ?? null,
      });
    }
  }
  const parFamille = new Map<FamilleCredits, LigneCredits[]>();
  // Dans un même rôle : la ligne sans instrument d'abord, puis les
  // instruments par ordre alphabétique de la langue.
  const triees = [...lignes.values()]
    .filter((l) => l.artistes.length > 0)
    .sort((a, b) => comparerRoles(a.role, b.role)
      || (a.instrument == null ? (b.instrument == null ? 0 : -1)
        : b.instrument == null ? 1 : comparerInstruments(a.instrument, b.instrument, langue)));
  for (const l of triees) {
    for (const a of l.artistes) {
      a.pistes.sort((x, y) => (x.disque ?? 0) - (y.disque ?? 0) || (x.numero ?? 0) - (y.numero ?? 0));
    }
    const f = familleDuRole(l.role);
    parFamille.set(f, [...(parFamille.get(f) ?? []), l]);
  }
  return ORDRE_DES_FAMILLES
    .filter((f) => parFamille.has(f))
    .map((famille) => ({ famille, lignes: parFamille.get(famille)! }));
}

/** Rôles génériques d'interprète, sans instrument (« Musicien »). */
const ROLES_GENERIQUES_D_INTERPRETE = new Set(['performer']);
/** Rôles d'écriture qui répètent souvent le compositeur (« Auteur », « Parolier »). */
const ROLES_D_AUTEUR = new Set(['writer', 'lyricist']);

/** Une personne créditée, telle que la comparent les règles de doublon. */
interface Personne {
  id: number | null;
  mbid: string | null;
  /** Le nom affiché, espaces resserrés. */
  nom: string;
  cle: string;
}

/** Le MBID de chaque artiste déjà placé dans une ligne (hors du type public). */
const mbidDesArtistes = new WeakMap<ArtisteCredite, string>();

function personneDu(c: CreditAvecPiste): Personne | null {
  const nom = (c.artist_name ?? '').replace(/\s+/g, ' ').trim();
  if (!nom) return null;
  return { id: c.artist_id ?? null, mbid: c.artist_mbid?.trim() || null, nom, cle: normaliserNom(nom) };
}

function personneDeLArtiste(a: ArtisteCredite): Personne {
  return { id: a.artist_id, mbid: mbidDesArtistes.get(a) ?? null, nom: a.artist_name, cle: normaliserNom(a.artist_name) };
}

function clePiste(c: CreditAvecPiste): string {
  return c.track_id == null ? '' : String(c.track_id);
}

function ajouterPersonne(m: Map<string, Personne[]>, cle: string, p: Personne): void {
  const l = m.get(cle);
  if (l) l.push(p); else m.set(cle, [p]);
}

/**
 * Même personne ? Deux MBID connus tranchent ; le même `artist_id` aussi.
 * Sinon, la clé normalisée du nom — sauf deux fiches distinctes au nom
 * rigoureusement identique : la bibliothèque les a séparées exprès (homonymes).
 */
function memePersonne(a: Personne, b: Personne): boolean {
  if (a.mbid && b.mbid) return a.mbid === b.mbid;
  if (a.id != null && b.id != null && a.id === b.id) return true;
  if (a.cle !== b.cle) return false;
  if (a.id != null && b.id != null && a.nom === b.nom) return false;
  return true;
}

/** Nombre de diacritiques d'un nom (« Beyoncé » : 1). */
function diacritiques(nom: string): number {
  return (nom.normalize('NFKD').match(/\p{M}/gu) ?? []).length;
}

/** Vrai quand le nom n'est ni tout en minuscules ni tout en majuscules. */
function casseSoignee(nom: string): boolean {
  return nom !== nom.toLowerCase() && nom !== nom.toUpperCase();
}

/**
 * `candidat` est-il plus complet que `actuel` ? Les accents d'abord, puis une
 * casse soignée plutôt que tout-minuscule ou tout-majuscule, puis la longueur.
 */
function graphiePlusComplete(candidat: string, actuel: string): boolean {
  const d = diacritiques(candidat) - diacritiques(actuel);
  if (d !== 0) return d > 0;
  const c = Number(casseSoignee(candidat)) - Number(casseSoignee(actuel));
  if (c !== 0) return c > 0;
  return candidat.length > actuel.length;
}

/**
 * Les numéros des pistes, « 1, 2, 5 » — « 1.3, 2.1 » quand l'album a plusieurs
 * disques. Une piste sans numéro se cite par son titre.
 */
export function numerosDePistes(pistes: PisteCitee[], plusieursDisques: boolean): string {
  return pistes
    .map((p) => {
      if (p.numero == null) return p.titre ?? '';
      return plusieursDisques && p.disque != null ? `${p.disque}.${p.numero}` : String(p.numero);
    })
    .filter(Boolean)
    .join(', ');
}

/** Le libellé d'une ligne : l'instrument quand il y en a un, sinon le rôle. */
export function libelleLigne(l: LigneCredits, traduire: (cle: string) => string): string {
  if (l.instrument) return l.instrument.charAt(0).toUpperCase() + l.instrument.slice(1);
  return libelleRole(l.role, traduire);
}

/**
 * Design v3 (§10.5) — « Écrit par… » sous les paroles : les AUTEURS et
 * COMPOSITEURS de la piste, tirés de ses crédits (rôles `composer`, `writer`
 * — parolier côté serveur, #4862 — et `lyricist` — étiquette du fichier).
 * Un nom une seule fois, dans l'ordre de `ORDRE_DES_ROLES` puis des crédits.
 * Liste vide quand aucun n'est connu : l'écran n'affiche alors rien, il
 * n'invente pas d'attribution.
 */
export function auteursDesParoles(credits: readonly TrackCredit[]): string[] {
  const roles = ['composer', 'writer', 'lyricist'];
  const auteurs = credits
    .filter((c) => roles.includes(c.role) && c.artist_name?.trim())
    .sort((a, b) => roles.indexOf(a.role) - roles.indexOf(b.role));
  const vus = new Set<string>();
  const out: string[] = [];
  for (const c of auteurs) {
    const nom = c.artist_name.trim();
    const cle = nom.toLocaleLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push(nom);
  }
  return out;
}
