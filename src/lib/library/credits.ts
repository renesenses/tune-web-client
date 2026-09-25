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
export function uniqueInstruments(credits: TrackCredit[]): string[] {
  const set = new Set<string>();
  for (const c of credits) {
    if (c.instrument) set.add(c.instrument);
  }
  return [...set].sort();
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
  'composer', 'writer', 'lyricist', 'arranger', 'conductor',
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
  const cle = `credits.${role}`;
  const traduit = traduire(cle);
  if (traduit && traduit !== cle) return traduit;
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** Une ligne de crédit, et la piste qu'elle concerne quand la route la donne. */
export interface CreditAvecPiste extends TrackCredit {
  track_title?: string | null;
  track_number?: number | null;
  disc_number?: number | null;
}

/** Les deux blocs de la fiche de Roon, plus un bloc pour l'inconnu. */
export type FamilleCredits = 'interpretes' | 'production' | 'autres';

const FAMILLE: Record<string, FamilleCredits> = {
  composer: 'interpretes', writer: 'interpretes', lyricist: 'interpretes',
  arranger: 'interpretes', conductor: 'interpretes', artist: 'interpretes',
  performer: 'interpretes', vocal: 'interpretes',
  producer: 'production', mixer: 'production', remixer: 'production',
  engineer: 'production', mastering: 'production', programming: 'production',
};

export function familleDuRole(role: string): FamilleCredits {
  return FAMILLE[role] ?? 'autres';
}

export interface PisteCitee {
  track_id: number;
  numero: number | null;
  disque: number | null;
  titre: string | null;
}

export interface ArtisteCredite {
  artist_id: number | null;
  artist_name: string;
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
export function blocsDeCredits(credits: CreditAvecPiste[]): BlocCredits[] {
  const lignes = new Map<string, LigneCredits>();
  for (const c of credits) {
    const role = c.role || 'performer';
    const instrument = c.instrument?.trim() || null;
    const cleLigne = `${role}|${(instrument ?? '').toLowerCase()}`;
    let ligne = lignes.get(cleLigne);
    if (!ligne) {
      ligne = { role, instrument, artistes: [] };
      lignes.set(cleLigne, ligne);
    }
    const nom = (c.artist_name ?? '').trim();
    if (!nom) continue;
    const cleArtiste = (a: ArtisteCredite) =>
      c.artist_id != null ? a.artist_id === c.artist_id : a.artist_name.toLowerCase() === nom.toLowerCase();
    let artiste = ligne.artistes.find(cleArtiste);
    if (!artiste) {
      artiste = { artist_id: c.artist_id ?? null, artist_name: nom, pistes: [] };
      ligne.artistes.push(artiste);
    }
    if (c.track_id != null && !artiste.pistes.some((p) => p.track_id === c.track_id)) {
      artiste.pistes.push({
        track_id: c.track_id,
        numero: c.track_number ?? null,
        disque: c.disc_number ?? null,
        titre: c.track_title ?? null,
      });
    }
  }
  const parFamille = new Map<FamilleCredits, LigneCredits[]>();
  const triees = [...lignes.values()]
    .filter((l) => l.artistes.length > 0)
    .sort((a, b) => comparerRoles(a.role, b.role));
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
