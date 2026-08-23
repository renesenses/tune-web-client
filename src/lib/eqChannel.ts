/**
 * Le canal d'une bande d'égaliseur, entre l'écran et le serveur.
 *
 * Trois valeurs à l'écran — « les deux », gauche, droite — et **deux** formes
 * sur le fil : un nombre, ou **rien du tout**. C'est cette asymétrie qui casse
 * en silence, et c'est pourquoi elle est ici plutôt qu'en ligne dans le
 * composant.
 *
 * « Les deux » doit partir comme un champ **absent**, et non comme `-1`, `null`
 * ou `"both"` :
 *
 * - le serveur lit `Option<u16>` et traite l'absence comme « tous les canaux » ;
 * - un préréglage enregistré avant cette version n'a pas ce champ, et doit
 *   pouvoir être réenregistré sans en gagner un ;
 * - une valeur qui désigne un canal — même `-1` — ferait taire l'autre.
 */
export type ChoixDeCanal = 'both' | '0' | '1';

/** La valeur du sélecteur pour une bande, y compris quand le champ est absent. */
export function choixDepuisBande(channel: number | null | undefined): ChoixDeCanal {
  if (channel === 0) return '0';
  if (channel === 1) return '1';
  // `null`, `undefined`, ou un canal qu'on ne sait pas nommer : « les deux »
  // est le seul repli qui ne fasse taire personne.
  return 'both';
}

/**
 * Le champ à écrire dans la bande pour un choix donné.
 *
 * `undefined` — et non `null` : `JSON.stringify` retire une clé `undefined`,
 * là où il sérialise `null`. Le serveur verrait alors un champ présent et
 * devrait le traiter comme une absence, ce qu'on peut lui épargner.
 */
export function canalDepuisChoix(choix: string): number | undefined {
  return choix === 'both' ? undefined : Number(choix);
}
