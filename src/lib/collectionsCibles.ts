/**
 * Faire entrer un album dans un dossier de « Collections », et l'en sortir —
 * #1222.
 *
 * Lulu (JLuc), fil 1844, 18/09/2026 : « un bouton permettant le transfert des
 * albums de la "Bibliothèque" vers les répertoires de "Collections" ».
 *
 * 🔴 TREIZIÈME « écrit mais pas branché » de ce client. `addAlbumToCollection`
 * et `removeAlbumFromCollection` existent dans `api.ts`, le serveur expose les
 * deux routes, et leurs SEULS appelants vivent dans l'ancienne interface
 * (`LibraryView.svelte:144`, `CollectionsView.svelte:210`). Aucun composant de
 * `src/components/v2/` ne les appelait : dans la nouvelle interface, un album
 * ne pouvait ni entrer dans un dossier ni en sortir.
 *
 * Même motif que #1143 (bouton Supprimer d'une collection) et #1150 (création
 * de playlist intelligente) : une capacité présente en V0, non portée en V1.
 *
 * Ce module ne fait que du CHOIX — quelles collections proposer, et sous quel
 * libellé. Il est pur, donc mesurable sans monter d'écran.
 */

/** Une collection telle que `GET /library/collections` la rend. */
export interface CollectionCible {
  id?: number | null;
  name?: string | null;
  /** Les identifiants d'albums qu'elle porte déjà, quand la route les donne. */
  album_ids?: unknown;
}

export interface EntreeCible {
  id: number;
  nom: string;
  /** L'album y est DÉJÀ : l'entrée reste proposée, mais elle le dit. */
  deja: boolean;
}

/**
 * Les collections où proposer d'ajouter cet album.
 *
 * 🔴 Les collections INTELLIGENTES ne sont pas là, et ne peuvent pas y être :
 * leur contenu vient de leurs règles, pas d'une liste d'identifiants. Y
 * « ajouter » un album n'aurait aucun sens, et la route ne l'accepte pas. Cet
 * écran ne montre donc que les collections manuelles — c'est à l'appelant de
 * ne passer que celles-là.
 *
 * On garde les collections qui contiennent déjà l'album au lieu de les
 * retirer : leur absence se lirait comme « cette collection n'existe pas »,
 * alors que la bonne information est « il y est déjà ».
 */
export function ciblesPourAlbum(
  collections: readonly CollectionCible[] | null | undefined,
  albumId: number | null | undefined,
): EntreeCible[] {
  const out: EntreeCible[] = [];
  for (const c of collections ?? []) {
    // 🔴 `Number(null)` vaut 0, et 0 est fini : un `id: null` passait la
    // garde et proposait une collection qui n'existe pas. On exige un
    // identifiant STRICTEMENT positif, ce que le serveur rend toujours.
    const id = c?.id == null ? NaN : Number(c.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const nom = (c?.name ?? '').trim();
    if (!nom) continue;
    out.push({ id, nom, deja: contient(c, albumId) });
  }
  return out;
}

/** L'album est-il déjà dans cette collection ? `false` quand la route ne rend
 *  pas `album_ids` — on ne prétend pas savoir ce qu'on n'a pas lu. */
export function contient(c: CollectionCible | null | undefined, albumId: number | null | undefined): boolean {
  if (albumId == null || !Array.isArray(c?.album_ids)) return false;
  return (c!.album_ids as unknown[]).some((v) => Number(v) === Number(albumId));
}

/**
 * Le libellé d'une entrée du menu.
 *
 * `traduire` reçoit la clé et rend le gabarit : le module reste pur et
 * mesurable sans le magasin `t`.
 */
export function libelleCible(e: EntreeCible, traduire: (cle: string) => string): string {
  return e.deja
    ? traduire('v2.col.alreadyIn').replace('{name}', e.nom)
    : e.nom;
}
