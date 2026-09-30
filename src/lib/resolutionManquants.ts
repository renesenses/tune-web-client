/**
 * Résoudre un album manquant d'un dossier « Collections » —
 * tune-server-rust#5527 et #5528 (Lulu, fil 1891).
 *
 * Deux fonctions pures, pour que l'écran (`CollectionsV2.svelte`) ne porte
 * que l'affichage :
 *
 * - {@link lireResolutions} lit `GET /library/collections/{id}/missing` ;
 * - {@link resoudreManquant} fait le geste : « Oublier » (la route de retrait
 *   EXISTANTE, avec l'identifiant mort) ou « Remplacer par … » (ranger le
 *   vivant PUIS retirer le mort — si le premier appel échoue, rien n'est
 *   perdu).
 *
 * Rien n'est jamais remplacé d'office : le serveur PROPOSE, l'utilisateur
 * choisit.
 */

/** Un album vivant désigné par le serveur. */
export interface AlbumProche {
  id: number;
  titre: string;
  artiste: string | null;
}

/** Un remplaçant proposé, et s'il est déjà rangé dans ce dossier. */
export interface Remplacant extends AlbumProche {
  dejaRange: boolean;
}

/** `{id, title, artist}` du serveur, ou `null` s'il est incomplet. */
export function albumProche(a: any): AlbumProche | null {
  if (!a || typeof a.id !== 'number' || typeof a.title !== 'string') return null;
  return {
    id: a.id,
    titre: a.title,
    artiste: typeof a.artist === 'string' && a.artist ? a.artist : null,
  };
}

/**
 * Les remplaçants proposés, par identifiant d'album manquant. Une réponse
 * mal formée ne propose rien : « Oublier » reste toujours possible.
 */
export function lireResolutions(liste: unknown): Record<number, Remplacant[]> {
  const r: Record<number, Remplacant[]> = {};
  if (!Array.isArray(liste)) return r;
  for (const m of liste as any[]) {
    if (!m || typeof m.id !== 'number') continue;
    const candidats: Remplacant[] = [];
    for (const c of Array.isArray(m.candidates) ? m.candidates : []) {
      const a = albumProche(c);
      if (a) candidats.push({ ...a, dejaRange: c.in_collection === true });
    }
    r[m.id] = candidats;
  }
  return r;
}

/** Les remplaçants à OFFRIR : ni déjà rangés ici, ni l'album « réuni dans ». */
export function remplacantsAOffrir(
  candidats: Remplacant[] | undefined,
  reuniDans: AlbumProche | null,
): Remplacant[] {
  return (candidats ?? []).filter((c) => !c.dejaRange && c.id !== reuniDans?.id);
}

/** Ce dont le geste a besoin — les deux routes existantes du client. */
export interface RoutesDeRangement {
  addAlbumToCollection(collectionId: number, albumId: number): Promise<unknown>;
  removeAlbumFromCollection(collectionId: number, albumId: number): Promise<unknown>;
}

/**
 * Oublier (`remplacant === null`) ou remplacer un album manquant.
 *
 * L'ordre est la garantie : le vivant est rangé AVANT que le mort soit
 * retiré. Un rangement refusé laisse le dossier tel quel.
 */
export async function resoudreManquant(
  api: RoutesDeRangement,
  dossier: number,
  mort: number,
  remplacant: number | null,
): Promise<void> {
  if (remplacant != null) await api.addAlbumToCollection(dossier, remplacant);
  await api.removeAlbumFromCollection(dossier, mort);
}
