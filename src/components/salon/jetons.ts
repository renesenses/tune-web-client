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
};

export const JEU_PAR_DEFAUT = 'roon-like';

export function chargerJetons(jeu: string | null | undefined): Promise<unknown> {
  return (CHARGEURS_JETONS[jeu ?? ''] ?? CHARGEURS_JETONS[JEU_PAR_DEFAUT])();
}
