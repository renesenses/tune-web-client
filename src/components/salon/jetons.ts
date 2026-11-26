/**
 * Les jeux de jetons CSS des coquilles Salon, chargés à la demande.
 *
 * Une entrée par thème : la clé est le champ `jetons` du registre
 * `INTERFACES` (`lib/interfaceSalon.ts`), la valeur charge sa feuille
 * (`styles/salon/jetons-<clé>.css`). Les feuilles sont toutes scopées par
 * `[data-jeu="<clé>"]` : en charger une de plus ne touche à rien d'autre.
 */
export const CHARGEURS_JETONS: Record<string, () => Promise<unknown>> = {
  salon: () => import('../../styles/salon/jetons-salon.css'),
  // Thème « Néomorphique » (26/11/2026) : ses jetons vivent avec ses
  // commandes en relief, dans `styles/neomorphique/`.
  neomorphique: () => import('../../styles/neomorphique/jetons-neomorphique.css'),
};

export const JEU_PAR_DEFAUT = 'salon';

export function chargerJetons(jeu: string | null | undefined): Promise<unknown> {
  return (CHARGEURS_JETONS[jeu ?? ''] ?? CHARGEURS_JETONS[JEU_PAR_DEFAUT])();
}
