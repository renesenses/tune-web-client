/**
 * Les jeux de jetons CSS des coquilles Salon, chargés à la demande.
 *
 * Une entrée par thème : la clé est le champ `jetons` du registre
 * `INTERFACES` (`lib/interfaceSalon.ts`), la valeur charge sa feuille
 * (`styles/roon-like/jetons-<clé>.css`). Les feuilles sont toutes scopées par
 * `[data-jeu="<clé>"]` : en charger une de plus ne touche à rien d'autre.
 */
export const CHARGEURS_JETONS: Record<string, () => Promise<unknown>> = {
  'roon-like': () => import('../../styles/roon-like/jetons-roon-like.css'),
  // Thème « Néomorphique » (26/11/2026) : ses jetons vivent avec ses
  // commandes en relief, dans `styles/neomorphique/`.
  // Itération 2 : avec ses jetons, sa couche commune (tous les écrans de
  // Tune, menus, dialogues, connexion) et ses matières en relief.
  neomorphique: () => Promise.all([
    import('../../styles/neomorphique/jetons-neomorphique.css'),
    import('../../styles/neomorphique/ecrans-tune.css'),
    import('../../styles/neomorphique/relief.css'),
  ]),
};

export const JEU_PAR_DEFAUT = 'roon-like';

export function chargerJetons(jeu: string | null | undefined): Promise<unknown> {
  return (CHARGEURS_JETONS[jeu ?? ''] ?? CHARGEURS_JETONS[JEU_PAR_DEFAUT])();
}
