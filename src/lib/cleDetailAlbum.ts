/**
 * LA CLÉ D'HISTORIQUE D'UNE FICHE ALBUM — #980.
 *
 * Une entrée d'historique ne transporte que des CHAÎNES : `history.state`
 * clone son argument par l'algorithme de clonage structuré, et un `$state` de
 * Svelte 5 est un `Proxy` que ce clonage refuse — ou, pire, accepte en rangeant
 * une coquille vide dont on ne s'aperçoit qu'au retour. C'est le piège que
 * l'en-tête de `historiqueCoquille` documente, et que `etatCoquille` neutralise
 * en construisant l'état champ par champ.
 *
 * Ce module est le pendant pour les ALBUMS de ce que `ArtistesV2` écrit en
 * ligne pour les artistes (`artiste:${a.id}`). Il vit à part parce qu'un album
 * a DEUX espaces d'identifiants qui ne se mélangent pas :
 *
 *   • un album LOCAL porte un `id` numérique de la table `albums` ;
 *   • un album de SERVICE n'en a pas — il porte `source` + `source_id`, et
 *     l'identifiant 42 de Qobuz n'est pas l'album 42 de la bibliothèque.
 *
 * Les confondre donnerait deux fiches différentes sous la même clé.
 *
 * 🔴 Il rend `null` quand l'album n'est désignable ni d'une façon ni de
 * l'autre. Une clé inventée serait pire que pas d'entrée : le Précédent
 * refermerait une fiche pour en « rouvrir » une qui n'existe pas.
 */

/** Le minimum pour désigner un album, dans l'un ou l'autre référentiel. */
export interface AlbumDesignable {
  id?: unknown;
  source?: unknown;
  source_id?: unknown;
}

/** Un album de la BIBLIOTHÈQUE : un identifiant numérique, et pas de service. */
function estLocal(a: AlbumDesignable): boolean {
  const s = a.source == null ? 'local' : String(a.source);
  return a.id != null && (s === '' || s === 'local');
}

export function cleDetailAlbum(a: AlbumDesignable | null | undefined): string | null {
  if (!a) return null;
  if (estLocal(a)) return `album:${String(a.id)}`;
  const service = a.source == null ? '' : String(a.source).trim();
  const identifiant = a.source_id == null ? '' : String(a.source_id).trim();
  if (!service || !identifiant) return null;
  return `album:${service}:${identifiant}`;
}
