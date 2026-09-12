/** Ce que rend `POST /playlists/{id}/share` : le jeton public et son URL. */
export interface ReponseDePartage {
  token?: string;
  url?: string;
}

/** Le lien public à copier, à partir de ce que rend la publication.
 *
 *  Les deux écrans construisaient ce lien chacun de leur côté, et chacun avec
 *  un repli qui fabriquait un faux succès :
 *
 *   - `PlaylistManagerView` retombait sur `JSON.stringify(result)` — donc
 *     recopiait le corps brut de la réponse, jeton compris, en annonçant
 *     « lien copié » ;
 *   - `PlaylistsV2` retombait sur `/api/v1/playlists/shared/${r.token}` sans
 *     vérifier que `token` existe, ce qui colle un lien finissant par
 *     `undefined`, tout aussi silencieusement.
 *
 *  Une réponse qui ne porte pas de partage n'a pas de lien. Le seul geste
 *  juste est de LEVER : l'écran dira son erreur au lieu de mentir. C'est ce
 *  qui protège du piège du jour où la même route répondrait aussi en GET, avec
 *  un état (`{"shared": false}`) : l'appel « réussirait », et sans ce garde-fou
 *  l'utilisateur croirait tenir un lien.
 */
export function shareLink(reponse: ReponseDePartage | null | undefined, origin: string): string {
  const chemin =
    reponse?.url && reponse.url !== ''
      ? reponse.url
      : reponse?.token
        ? `/api/v1/playlists/shared/${reponse.token}`
        : null;
  if (chemin === null) {
    throw new Error('share response carries no url');
  }
  return new URL(chemin, origin).toString();
}
