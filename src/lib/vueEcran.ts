/**
 * Grille ou liste — pour N'IMPORTE QUEL écran qui offre les deux.
 *
 * ## Pourquoi ce module existe
 *
 * `lib/vueZones` portait exactement cette mécanique, mais sous une clé de
 * rangement écrite en dur et un nom de type lié aux Zones. Jean Valjean
 * demande la même chose pour la Radio (`renesenses/tune-web-client#863`,
 * fil 1671) :
 *
 *     « Dans Radio, avoir un onglet avec ses radios favorites et pouvoir voir
 *       le format d'émission et aussi une vue par ligne. »
 *
 * Recopier `vueZones` aurait donné deux implémentations de la même chose, à
 * tenir d'accord à la main. C'est exactement ce qui est arrivé sept fois dans
 * ce dépôt aujourd'hui — la construction des options d'aléatoire, la lecture
 * du recoupement d'avatar, le calcul de placement d'un menu. On généralise
 * plutôt qu'on duplique.
 *
 * ## Ce que ça ne fait PAS
 *
 * Le choix est rangé dans le NAVIGATEUR, pas dans le profil : c'est une
 * préférence d'affichage, locale à l'appareil, et le stockage peut refuser
 * (navigation privée). Un écran doit donc s'ouvrir même quand rien ne peut
 * être lu ni écrit.
 */

export type VueEcran = 'grille' | 'liste';

/** Une clé par écran. Deux écrans qui partagent la leur se suivraient. */
export const cleVue = (ecran: string) => `tune.v2.vue.${ecran}`;

/**
 * La vue retenue pour cet écran.
 *
 * Le défaut est la GRILLE partout : c'est ce que les écrans rendent
 * aujourd'hui, et changer le défaut surprendrait qui n'a rien réglé.
 */
export function lireVue(ecran: string, store?: Pick<Storage, 'getItem'>): VueEcran {
  try {
    const s = store ?? localStorage;
    return s.getItem(cleVue(ecran)) === 'liste' ? 'liste' : 'grille';
  } catch {
    return 'grille';
  }
}

export function ecrireVue(
  ecran: string,
  vue: VueEcran,
  store?: Pick<Storage, 'setItem'>,
): VueEcran {
  try {
    (store ?? localStorage).setItem(cleVue(ecran), vue);
  } catch {
    /* tant pis, le choix ne survivra pas au rechargement */
  }
  return vue;
}
