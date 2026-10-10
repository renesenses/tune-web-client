/**
 * « Réinitialiser la compatibilité » — tune-server-rust#5962.
 *
 * Quand un renderer DLNA refuse `SetAVTransportURI` (501, 714, 716), le
 * serveur essaie une commande plus conservatrice et RETIENT celle qui passe,
 * par appareil et par format. Depuis #5962, cette mémoire survit au
 * redémarrage. Le bouton de la fiche du renderer la fait oublier
 * (`DELETE /zones/{id}/compatibilite-renderer`) : la piste suivante repart de
 * la commande complète.
 *
 * Décision de Bertrand (08/10) : un bouton sur la fiche de chaque renderer.
 */

/** La route ne concerne que les zones DLNA : le serveur répond 400 aux
 *  autres, OpenHome compris. Le bouton n'est donc montré qu'à elles. */
export function compatibiliteReinitialisable(outputType: string | null | undefined): boolean {
  return outputType === 'dlna';
}

/** Ce que l'écran dit après la réinitialisation, selon ce que le serveur a
 *  oublié. Zéro profil n'est pas un échec : il n'y avait rien d'appris. */
export function messageReinitialisation(
  t: (cle: string) => string,
  profilsOublies: number | null | undefined,
): string {
  const n = Number(profilsOublies ?? 0);
  if (!Number.isFinite(n) || n <= 0) return t('renderer.resetCompatNone');
  return t('renderer.resetCompatDone').replace('{n}', String(n));
}
