/**
 * Choisir les pistes à convertir (tune-server-rust#5483).
 *
 * Xavier Joly, 0.9.168 : « il faut ajouter la possibilité de naviguer dans
 * les répertoires pour être plus précis si l'on ne veut convertir que
 * certaines pistes d'un album par exemple. »
 *
 * La sélection a deux étages :
 *  - `albums` : les albums cochés ENTIERS (la carte de la grille) ;
 *  - `pistes` : pour un album déplié, les pistes cochées une à une.
 * Un album dont toutes les pistes sont cochées redevient un album entier ;
 * un album dont aucune ne l'est sort de la sélection.
 *
 * Au lancement, un album entier part en `{album_id}` (le serveur le résout
 * lui-même, y compris des pistes ajoutées depuis), une piste d'un album
 * partiel en `{track_id}`. Les deux formes sont dans `sources` : `track_id`
 * y est accepté par tous les serveurs, alors que `track_ids` au premier
 * niveau (#5483) serait ignoré sans bruit par un serveur antérieur, qui ne
 * convertirait alors que les albums entiers.
 */

export interface PisteDeLAlbum {
  id?: number | null;
  title?: string | null;
  file_path?: string | null;
  disc_number?: number | null;
  track_number?: number | null;
}

export interface DossierDePistes {
  /** Chemin complet du dossier (clé). */
  dossier: string;
  /** Ce qui le distingue des autres dossiers de l'album (« CD1 »), ou `''`
   *  quand l'album tient dans un seul dossier. */
  libelle: string;
  pistes: PisteDeLAlbum[];
}

function parent(chemin: string): string {
  const i = Math.max(chemin.lastIndexOf('/'), chemin.lastIndexOf('\\'));
  return i > 0 ? chemin.slice(0, i) : '';
}

function segments(chemin: string): string[] {
  return chemin.split(/[\\/]/).filter(Boolean);
}

/** Les pistes d'un album, regroupées par dossier, dans l'ordre de l'album. */
export function dossiersDesPistes(pistes: PisteDeLAlbum[]): DossierDePistes[] {
  const groupes = new Map<string, PisteDeLAlbum[]>();
  for (const p of pistes) {
    if (p.id == null) continue;
    const d = p.file_path ? parent(p.file_path) : '';
    const g = groupes.get(d);
    if (g) g.push(p); else groupes.set(d, [p]);
  }
  const dossiers = [...groupes.keys()];
  // Préfixe commun, segment par segment : « /m/Album/CD1 » et « /m/Album/CD2 »
  // se nomment « CD1 » et « CD2 ».
  const decoupes = dossiers.map(segments);
  let commun = 0;
  if (decoupes.length > 1) {
    while (decoupes.every((s) => s.length > commun && s[commun] === decoupes[0][commun])) commun++;
  }
  return dossiers.map((dossier, i) => ({
    dossier,
    libelle: dossiers.length > 1 ? (decoupes[i].slice(commun).join('/') || decoupes[i].at(-1) || '') : '',
    pistes: groupes.get(dossier)!,
  }));
}

export interface Selection {
  /** Albums entiers. */
  albums: Set<number>;
  /** Albums partiels : identifiants des pistes cochées. */
  pistes: Map<number, Set<number>>;
}

export function selectionVide(): Selection {
  return { albums: new Set(), pistes: new Map() };
}

/** Les pistes cochées d'un album, étant donné toutes ses pistes. */
export function pistesCochees(sel: Selection, albumId: number, toutes: number[]): Set<number> {
  if (sel.albums.has(albumId)) return new Set(toutes);
  return new Set(sel.pistes.get(albumId) ?? []);
}

/** Pose les pistes cochées d'un album et normalise : tout ⇒ album entier,
 *  rien ⇒ hors sélection. Rend une NOUVELLE sélection (état Svelte). */
export function poserPistes(sel: Selection, albumId: number, toutes: number[], cochees: Set<number>): Selection {
  const albums = new Set(sel.albums);
  const pistes = new Map(sel.pistes);
  albums.delete(albumId);
  pistes.delete(albumId);
  const retenues = toutes.filter((id) => cochees.has(id));
  if (toutes.length > 0 && retenues.length === toutes.length) albums.add(albumId);
  else if (retenues.length > 0) pistes.set(albumId, new Set(retenues));
  return { albums, pistes };
}

/** Coche ou décoche un album entier (la carte de la grille). */
export function basculerAlbum(sel: Selection, albumId: number): Selection {
  const albums = new Set(sel.albums);
  const pistes = new Map(sel.pistes);
  if (albums.has(albumId) || pistes.has(albumId)) {
    albums.delete(albumId);
    pistes.delete(albumId);
  } else {
    albums.add(albumId);
  }
  return { albums, pistes };
}

/** Albums concernés (entiers ou partiels), pour le compteur et les dossiers. */
export function albumsConcernes(sel: Selection): number[] {
  return [...sel.albums, ...sel.pistes.keys()];
}

export function nombreDePistesChoisies(sel: Selection): number {
  let n = 0;
  for (const s of sel.pistes.values()) n += s.size;
  return n;
}

/** Les `sources` de `POST /converter/start` : albums entiers, puis pistes
 *  choisies des albums partiels. */
export function sourcesDeLaSelection(sel: Selection): Array<{ album_id: number } | { track_id: number }> {
  return [
    ...[...sel.albums].map((album_id) => ({ album_id })),
    ...[...sel.pistes.values()].flatMap((s) => [...s].map((track_id) => ({ track_id }))),
  ];
}
