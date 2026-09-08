/**
 * L'identité d'appareil d'une zone : ce qu'on affiche, et ce qui compte comme
 * une modification.
 *
 * #763 — « Impossible d'effacer marque et modèle d'une zone : dès qu'on vide
 * le champ, le bouton Appliquer disparaît. »
 *
 * `ZoneDeviceEditor` initialisait ses champs avec la valeur EFFECTIVE
 * (override, sinon détection) mais calculait l'état « modifié » contre le seul
 * OVERRIDE. Sur une zone dont l'identité vient de la découverte réseau — la
 * majorité : sur le .18, une zone sur quatorze porte une marque choisie — les
 * deux ne coïncidaient pas :
 *
 *   - au montage, le champ affiche « EVERSOLO » et l'override vaut `null` :
 *     l'écran se croyait DÉJÀ modifié, et « Appliquer » restait affiché sans
 *     que personne n'ait rien touché ;
 *   - en vidant le champ pour retirer l'identité, on retombait sur `'' === ''` :
 *     l'écran se croyait vierge, et le bouton disparaissait.
 *
 * Comparer à la valeur effective corrige les deux d'un coup.
 */

export interface IdentiteZone {
  brand?: string | null;
  model?: string | null;
  detected_manufacturer?: string | null;
  detected_model?: string | null;
}

const plier = (v: string | null | undefined) => (v ?? '').trim();

/** Ce que l'écran affiche : le choix de l'utilisateur, sinon la détection. */
export function identiteEffective(zone: IdentiteZone): { marque: string; modele: string } {
  return {
    marque: plier(zone.brand) || plier(zone.detected_manufacturer),
    modele: plier(zone.model) || plier(zone.detected_model),
  };
}

/**
 * Y a-t-il quelque chose à appliquer ?
 *
 * 🔴 La comparaison porte sur la valeur EFFECTIVE, pas sur l'override : c'est
 * elle qu'on a mise dans le champ, c'est donc à elle qu'il faut comparer ce
 * que l'utilisateur en a fait.
 */
export function identiteModifiee(zone: IdentiteZone, marqueSaisie: string, modeleSaisi: string): boolean {
  const effective = identiteEffective(zone);

  return plier(marqueSaisie) !== effective.marque || plier(modeleSaisi) !== effective.modele;
}
